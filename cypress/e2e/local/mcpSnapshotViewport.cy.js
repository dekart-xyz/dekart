/* eslint-disable no-undef */

const appUrl = Cypress.env('DEKART_E2E_BASE_URL') || 'http://localhost:3000'
const ciValue = String(Cypress.env('CI') ?? '').toLowerCase()
const isCI = ciValue === 'true' || ciValue === '1' || String(Cypress.env('CYPRESS_CI') ?? '') === '1'
const apiOrigin = isCI ? appUrl : 'http://localhost:8080'
const apiBase = isCI ? `${appUrl}/api/v1` : 'http://localhost:8080/api/v1'

function getReduxStoreFromWindow (win) {
  const rootNode = win.document.getElementById('root')
  const reactRootKey = Object.keys(rootNode).find(key => key.startsWith('__reactContainer$') || key.startsWith('__reactFiber$'))
  const reactRoot = rootNode[reactRootKey]
  const initialFiber = reactRoot.current ? reactRoot.current : (reactRoot.stateNode?.current || reactRoot)
  const queue = [initialFiber]
  while (queue.length > 0) {
    const fiber = queue.shift()
    if (fiber?.memoizedProps?.store?.getState) {
      return fiber.memoizedProps.store
    }
    if (fiber?.child) queue.push(fiber.child)
    if (fiber?.sibling) queue.push(fiber.sibling)
  }
  throw new Error('Redux store not found')
}

function getDeviceToken () {
  return cy.request('POST', `${apiBase}/device`, {
    device_name: 'cypress-local-mcp-snapshot'
  }).then((startResp) => {
    expect(startResp.status, 'device start status').to.eq(200)
    const deviceId = startResp.body.device_id
    const authUrl = startResp.body.auth_url
    expect(deviceId, 'device_id').to.be.a('string').and.not.eq('')
    expect(authUrl, 'auth_url').to.be.a('string').and.include('/device/authorize')

    cy.setDevClaimsEmail('test@gmail.com')
    cy.visit(authUrl)
    cy.contains('button', 'Authorize', { timeout: 20000 }).click()
    cy.contains('Device authorized', { timeout: 20000 }).should('be.visible')

    return cy.request('POST', `${apiBase}/device/token`, { device_id: deviceId }).then((tokenResp) => {
      expect(tokenResp.status, 'device token status').to.eq(200)
      expect(tokenResp.body.status, 'device token response status').to.eq('authorized')
      expect(tokenResp.body.token, 'device token').to.be.a('string').and.not.eq('')
      return tokenResp.body.token
    })
  })
}

function callMCP (token, name, args = {}) {
  return cy.request({
    method: 'POST',
    url: `${apiBase}/mcp/call`,
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: {
      name,
      arguments: args
    },
    failOnStatusCode: false
  }).then((response) => {
    expect(response.status, `${name} http status`).to.eq(200)
    expect(response.body).to.have.property('result')
    return response.body.result
  })
}

function readId (obj, candidates) {
  for (const key of candidates) {
    const value = obj?.[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}

function buildPointLayer (datasetId) {
  return {
    id: 'snapshot-ready-points',
    type: 'point',
    config: {
      dataId: datasetId,
      columnMode: 'points',
      label: 'missed-stops.csv',
      color: [231, 159, 213],
      highlightColor: [252, 242, 26, 255],
      columns: { lat: 'latitude', lng: 'longitude' },
      isVisible: true,
      visConfig: {
        radius: 18,
        fixedRadius: false,
        opacity: 0.8,
        outline: true,
        thickness: 3,
        strokeColor: [255, 255, 255],
        colorRange: {
          name: 'Global Warming',
          type: 'sequential',
          category: 'Uber',
          colors: ['#4C0035', '#880030', '#B72F15', '#D6610A', '#EF9100', '#FFC300']
        },
        strokeColorRange: {
          name: 'Global Warming',
          type: 'sequential',
          category: 'Uber',
          colors: ['#4C0035', '#880030', '#B72F15', '#D6610A', '#EF9100', '#FFC300']
        },
        radiusRange: [0, 50],
        filled: true,
        billboard: false,
        allowHover: true,
        showNeighborOnHover: false,
        showHighlightColor: true
      },
      hidden: false,
      textLabel: [{
        field: null,
        color: [255, 255, 255],
        size: 18,
        offset: [0, 0],
        anchor: 'start',
        alignment: 'center',
        outlineWidth: 0,
        outlineColor: [255, 0, 0, 255],
        background: false,
        backgroundColor: [0, 0, 200, 255]
      }]
    },
    visualChannels: {
      colorField: null,
      colorScale: 'quantile',
      strokeColorField: null,
      strokeColorScale: 'quantile',
      sizeField: null,
      sizeScale: 'linear'
    }
  }
}

function buildMapConfig (mapState, datasetId) {
  const layers = datasetId ? [buildPointLayer(datasetId)] : []
  const fieldsToShow = datasetId
    ? {
        [datasetId]: [
          { name: 'primary_type', format: null },
          { name: 'district', format: null },
          { name: 'date', format: null }
        ]
      }
    : {}
  return JSON.stringify({
    version: 'v1',
    config: {
      visState: {
        filters: [],
        layers,
        effects: [],
        interactionConfig: {
          tooltip: {
            fieldsToShow,
            compareMode: false,
            compareType: 'absolute',
            enabled: true
          },
          brush: { size: 0.5, enabled: false },
          geocoder: { enabled: false },
          coordinate: { enabled: false }
        },
        layerBlending: 'normal',
        overlayBlending: 'normal',
        splitMaps: [],
        animationConfig: { currentTime: null, speed: 1 },
        editor: { features: [], visible: true }
      },
      mapState: {
        bearing: 0,
        dragRotate: false,
        latitude: mapState.lat,
        longitude: mapState.lon,
        pitch: 0,
        zoom: mapState.zoom,
        isSplit: false,
        isViewportSynced: true,
        isZoomLocked: false,
        splitMapViewports: []
      },
      mapStyle: {
        styleType: 'dark',
        topLayerGroups: {},
        visibleLayerGroups: {
          label: true,
          road: true,
          border: false,
          building: true,
          water: true,
          land: true,
          '3d building': false
        },
        threeDBuildingColor: [9.665468314072013, 17.18305478057247, 31.1442867897876],
        backgroundColor: [0, 0, 0],
        mapStyles: {}
      },
      uiState: { mapControls: { mapLegend: { active: false } } }
    }
  })
}

function buildMissedStopsCsv () {
  const lines = ['primary_type,district,latitude,longitude,date']
  for (let index = 0; index < 8000; index += 1) {
    const lat = 33.65 + ((index % 100) * 0.006)
    const lon = -118.45 + (Math.floor(index / 100) * 0.006)
    lines.push(`missed_stop,DLA4,${lat.toFixed(6)},${lon.toFixed(6)},2026-06-30`)
  }
  return `${lines.join('\n')}\n`
}

function uploadMissedStopsCsv (token, fileId) {
  return cy.wrap(buildMissedStopsCsv(), { log: false }).then((fileBody) => {
    const totalSize = Cypress.Buffer.byteLength(fileBody)
    return callMCP(token, 'start_file_upload_session', {
      file_id: fileId,
      name: 'missed-stops.csv',
      mime_type: 'text/csv',
      total_size: totalSize
    }).then((session) => {
      const uploadSessionId = session.upload_session_id || session.uploadSessionId
      const uploadPartEndpoint = session.upload_part_endpoint || session.uploadPartEndpoint
      expect(uploadSessionId, 'upload_session_id').to.be.a('string').and.not.eq('')
      expect(uploadPartEndpoint, 'upload_part_endpoint').to.be.a('string').and.not.eq('')

      return cy.request({
        method: 'PUT',
        url: `${apiOrigin}${uploadPartEndpoint.replace('{part_number}', '1')}?part_size=${totalSize}`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/csv' },
        body: fileBody
      }).then((partResp) => {
        expect(partResp.status, 'upload part status').to.eq(200)
        return callMCP(token, 'complete_file_upload_session', {
          file_id: fileId,
          upload_session_id: uploadSessionId,
          parts: [partResp.body],
          total_size: totalSize
        })
      })
    })
  })
}

function expectSnapshotMapState (expected) {
  cy.window({ timeout: 60000 }).should((win) => {
    const store = getReduxStoreFromWindow(win)
    const mapState = store.getState().keplerGl.kepler.mapState
    expect(mapState.latitude, 'snapshot latitude').to.be.closeTo(expected.lat, 0.000001)
    expect(mapState.longitude, 'snapshot longitude').to.be.closeTo(expected.lon, 0.000001)
    expect(mapState.zoom, 'snapshot zoom').to.be.closeTo(expected.zoom, 0.000001)
  })
}

function expectSnapshotReadyToken () {
  cy.window({ timeout: 60000 }).should((win) => {
    expect(win.__dekartSnapshotReadyToken || '', 'snapshot ready token').to.be.a('string').and.not.eq('')
  })
}

function delayDatasetSources () {
  cy.intercept('GET', '**/api/v1/dataset-source/**', (req) => {
    req.continue((res) => {
      res.setDelay(3000)
    })
  })
}

describe('local MCP snapshot viewport params', () => {
  it('opens snapshot render URL with transient zoom, lat, and lon overrides', () => {
    const override = { lat: 33.95, lon: -118.05, zoom: 8.2 }
    const saved = { lat: 37.7749, lon: -122.4194, zoom: 9 }

    getDeviceToken().then((token) => {
      callMCP(token, 'create_report').then((reportResult) => {
        const reportId = readId(reportResult, ['report_id', 'reportId', 'id']) ||
          readId(reportResult?.report, ['id'])
        expect(reportId, 'report_id').to.be.a('string').and.not.eq('')

        return callMCP(token, 'create_dataset', { report_id: reportId }).then((datasetResult) => {
          const datasetId = readId(datasetResult, ['dataset_id', 'datasetId', 'id']) ||
            readId(datasetResult?.dataset, ['id'])
          expect(datasetId, 'dataset_id').to.be.a('string').and.not.eq('')

          return callMCP(token, 'create_file', { dataset_id: datasetId }).then((fileResult) => {
            const fileId = readId(fileResult, ['file_id', 'fileId', 'id']) ||
              readId(fileResult?.file, ['id'])
            expect(fileId, 'file_id').to.be.a('string').and.not.eq('')

            return uploadMissedStopsCsv(token, fileId).then(() => {
              return callMCP(token, 'update_report_map_config', {
                report_id: reportId,
                map_config: buildMapConfig(saved, datasetId)
              }).then(() => reportId)
            })
          })
        })
      }).then((reportId) => {
        return callMCP(token, 'create_report_snapshot', {
          report_id: reportId,
          zoom: override.zoom,
          lat: override.lat,
          lon: override.lon
        })
      }).then((snapshot) => {
        const renderUrl = snapshot.snapshot_render_url || snapshot.snapshotRenderUrl
        expect(renderUrl, 'snapshot_render_url').to.be.a('string')
        expect(renderUrl).to.include(`zoom=${override.zoom}`)
        expect(renderUrl).to.include(`lat=${override.lat}`)
        expect(renderUrl).to.include(`lon=${override.lon}`)

        delayDatasetSources()
        cy.visit(renderUrl)
        cy.contains('Untitled Report', { timeout: 60000 }).should('not.exist')
        expectSnapshotMapState(override)
        expectSnapshotReadyToken()
      })
    })
  })
})
