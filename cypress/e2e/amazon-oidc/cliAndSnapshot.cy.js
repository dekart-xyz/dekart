// Regression: Vay CLI requests had no identity behind ALB with Cognito
/* eslint-disable no-undef */

const apiOrigin = Cypress.env('DEKART_E2E_API_URL')
const apiBase = `${apiOrigin}/api/v1`
const csv = 'name,latitude,longitude\nBerlin,52.52,13.405\nMunich,48.1351,11.582\n'

// callMCP uses only the device credential, never the development identity.
function callMCP (token, name, args = {}) {
  return cy.request({
    method: 'POST',
    url: `${apiBase}/mcp/call`,
    headers: { Authorization: `Bearer ${token}` },
    body: { name, arguments: args }
  }).then(response => response.body.result)
}

// uploadFile exercises both part requests and completes their ordered manifest.
function uploadFile (token, fileId) {
  return callMCP(token, 'start_file_upload_session', {
    file_id: fileId, name: 'cities.csv', mime_type: 'text/csv', total_size: csv.length
  }).then(session => {
    const parts = []
    const chunks = [csv.slice(0, 32), csv.slice(32)]
    chunks.forEach((body, index) => {
      cy.request({
        method: 'PUT',
        url: `${apiOrigin}${session.upload_part_endpoint.replace('{part_number}', index + 1)}?part_size=${body.length}`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body
      }).then(response => parts.push(response.body))
    })
    return cy.then(() => callMCP(token, 'complete_file_upload_session', {
      file_id: fileId,
      upload_session_id: session.upload_session_id,
      parts,
      total_size: csv.length
    }))
  })
}

// pointLayer uses the uploaded and queried coordinates as separate visible layers.
function pointLayer (id, datasetId, label, color) {
  return {
    id,
    type: 'point',
    config: {
      dataId: datasetId,
      label,
      color,
      isVisible: true,
      columns: { lat: 'latitude', lng: 'longitude' },
      visConfig: { radius: 15, fixedRadius: false, opacity: 1 }
    },
    visualChannels: {}
  }
}

// readPointPixels inspects the captured map, without depending on renderer state.
function readPointPixels (base64) {
  return new Cypress.Promise((resolve, reject) => {
    const image = new Image()
    image.onerror = reject
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, image.width, image.height).data
      const points = { red: 0, green: 0, redX: 0, greenX: 0 }
      for (let i = 0; i < pixels.length; i += 4) {
        const x = (i / 4) % image.width
        // Screenshot color profiles shift RGB values; detect dominant colors rather than exact bytes.
        if (pixels[i] > 180 && pixels[i] > pixels[i + 1] * 1.5 && pixels[i] > pixels[i + 2] * 1.5) {
          points.red++
          points.redX += x
        }
        if (pixels[i + 1] > 180 && pixels[i + 1] > pixels[i] * 1.5 && pixels[i + 1] > pixels[i + 2] * 1.5) {
          points.green++
          points.greenX += x
        }
      }
      resolve(points)
    }
    image.src = `data:image/png;base64,${base64}`
  })
}

// assertRenderedPoints waits for both data layers; legends stay closed to exclude their color swatches.
function assertRenderedPoints (retries = 30) {
  let screenshotPath
  return cy.get('#default-deckgl-overlay').screenshot('amazon-oidc-map-points', {
    overwrite: true,
    onAfterScreenshot: (_element, details) => { screenshotPath = details.path }
  }).then(() => cy.readFile(screenshotPath, 'base64', { log: false }))
    .then(readPointPixels).then(points => {
      // Browser DuckDB execution can finish after the basemap first appears.
      if ((points.red < 4 || points.green < 4) && retries > 0) {
        cy.wait(500) // e2e-allow-wait: poll captured map until both layers draw
        return assertRenderedPoints(retries - 1)
      }
      expect(points.red, 'uploaded file points drawn').to.be.greaterThan(3)
      expect(points.green, 'DuckDB points drawn').to.be.greaterThan(3)
      expect(points.greenX / points.green, 'queried longitudes shifted east')
        .to.be.greaterThan(points.redX / points.red)
    })
}

describe('Amazon OIDC CLI and snapshots', () => {
  it('uses device credentials for tools, multipart upload, query and download, then renders with snapshot credentials', () => {
    cy.mcpDeviceToken('amazon-cli@example.com', { fresh: true }).then(token => {
      cy.clearAllCookies()
      cy.clearLocalStorage()
      cy.window().then(win => win.sessionStorage.clear())
      cy.request({
        url: `${apiBase}/mcp/tools`,
        headers: { Authorization: `Bearer ${token}` }
      }).its('body.tools').should(tools => {
        expect(tools.map(tool => tool.name)).to.include('create_report_snapshot')
      })

      let reportId
      let fileDatasetId
      let queryDatasetId
      callMCP(token, 'create_report').then(result => {
        reportId = result.report.id
        return callMCP(token, 'create_dataset', { report_id: reportId })
      }).then(dataset => {
        fileDatasetId = dataset.id
        return callMCP(token, 'create_file', { dataset_id: fileDatasetId })
      }).then(file => uploadFile(token, file.file_id)).then(upload => {
        cy.request({
          url: `${apiBase}/dataset-source/${fileDatasetId}/${upload.source_id}.csv`,
          headers: { Authorization: `Bearer ${token}` }
        }).its('body').should('eq', csv)
        return callMCP(token, 'create_dataset', { report_id: reportId })
      }).then(dataset => {
        queryDatasetId = dataset.id
        return callMCP(token, 'create_query', {
          dataset_id: queryDatasetId, execution_engine: 'QUERY_EXECUTION_ENGINE_DUCKDB'
        })
      }).then(query => {
        return callMCP(token, 'update_query', {
          query_id: query.query_id,
          query_text: 'SELECT name, latitude, longitude + 5 AS longitude FROM datasets."cities.csv"'
        }).then(() => callMCP(token, 'run_query', {
          query_id: query.query_id, accept_duckdb_execution: true
        }))
      }).then(() => callMCP(token, 'update_report_map_config', {
        report_id: reportId,
        map_config: JSON.stringify({
          version: 'v1',
          config: {
            visState: {
              layers: [
                pointLayer('file-points', fileDatasetId, 'File points', [255, 0, 0]),
                pointLayer('duckdb-points', queryDatasetId, 'DuckDB points', [0, 255, 0])
              ]
            },
            mapState: { latitude: 50.3, longitude: 15.2, zoom: 5, pitch: 0, bearing: 0 }
          }
        })
      })).then(() => callMCP(token, 'create_report_snapshot', {
        report_id: reportId, zoom: 5, lat: 50.3, lon: 15.2
      })).then(snapshot => {
        const renderURL = new URL(snapshot.snapshot_render_url, Cypress.config('baseUrl'))
        expect(renderURL.pathname).to.eq(`/reports/${reportId}/snapshot`)
        expect(renderURL.searchParams.get('snapshot_token')).to.be.a('string').and.not.eq('')
        cy.visit(renderURL.toString())
        cy.get('.mapboxgl-canvas', { timeout: 120000 }).should('be.visible')
        assertRenderedPoints()
        cy.get('.map-control-button.show-legend').click()
        cy.contains('.legend--layer_name', 'File points', { timeout: 120000 }).should('be.visible')
        cy.contains('.legend--layer_name', 'DuckDB points', { timeout: 120000 }).should('be.visible')
        cy.screenshot('amazon-oidc-file-and-duckdb-snapshot')
      })
    })
  })
})
