/* eslint-disable no-undef */

const appUrl = Cypress.config('baseUrl')
const apiOrigin = Cypress.env('DEKART_E2E_API_URL')
const apiBase = `${apiOrigin}/api/v1`

// getDeviceToken authorizes this MCP test through the user-visible device flow.
function getDeviceToken () {
  return cy.mcpDeviceToken('test@gmail.com', { deviceName: 'cypress-local-mcp-geojson-upload' })
}

// callMCP invokes one named tool and returns its canonical result payload.
function callMCP (token, name, args = {}) {
  return cy.request({
    method: 'POST',
    url: `${apiBase}/mcp/call`,
    headers: { Authorization: `Bearer ${token}` },
    body: { name, arguments: args },
    failOnStatusCode: false
  }).then((response) => {
    expect(response.status, `${name} http status: ${JSON.stringify(response.body)}`).to.eq(200)
    expect(response.body).to.have.property('result')
    return response.body.result
  })
}

// uploadGenericGeoJSON reproduces the CLI fallback MIME through the complete upload flow.
function uploadGenericGeoJSON (token, fileId) {
  return cy.readFile('cypress/fixtures/sample.geojson', 'utf8').then((fileBody) => {
    const totalSize = Cypress.Buffer.byteLength(fileBody)
    return callMCP(token, 'start_file_upload_session', {
      file_id: fileId,
      name: 'sample.geojson',
      mime_type: 'application/octet-stream',
      total_size: totalSize
    }).then((session) => {
      const uploadSessionId = session.upload_session_id
      const uploadPartEndpoint = session.upload_part_endpoint
      expect(uploadSessionId, 'upload_session_id').to.be.a('string').and.not.eq('')
      expect(uploadPartEndpoint, 'upload_part_endpoint').to.be.a('string').and.not.eq('')

      return cy.request({
        method: 'PUT',
        url: `${apiOrigin}${uploadPartEndpoint.replace('{part_number}', '1')}?part_size=${totalSize}`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body: fileBody
      }).then((partResp) => callMCP(token, 'complete_file_upload_session', {
        file_id: fileId,
        upload_session_id: uploadSessionId,
        parts: [partResp.body],
        total_size: totalSize
      }))
    })
  })
}

describe('local MCP GeoJSON upload MIME inference', () => {
  it('queries a .geojson uploaded with the CLI generic MIME fallback', () => {
    getDeviceToken().then((token) => callMCP(token, 'create_report').then((reportResult) => {
      const reportId = reportResult.report.id

      return callMCP(token, 'create_dataset', { report_id: reportId }).then((sourceDatasetResult) => {
        const sourceDatasetId = sourceDatasetResult.id
        return callMCP(token, 'create_file', { dataset_id: sourceDatasetId }).then((fileResult) => {
          const fileId = fileResult.file_id
          return uploadGenericGeoJSON(token, fileId)
        })
      }).then(() => callMCP(token, 'create_dataset', { report_id: reportId }))
        .then((queryDatasetResult) => {
          const queryDatasetId = queryDatasetResult.id
          return callMCP(token, 'create_query', {
            dataset_id: queryDatasetId,
            execution_engine: 'QUERY_EXECUTION_ENGINE_DUCKDB'
          })
        })
        .then((queryResult) => {
          const queryId = queryResult.query_id
          return callMCP(token, 'update_query', {
            query_id: queryId,
            query_text: 'SELECT name, ST_X(ST_GeomFromWKB(_geojson)) AS longitude, ST_Y(ST_GeomFromWKB(_geojson)) AS latitude FROM datasets."sample.geojson"'
          }).then(() => callMCP(token, 'run_query', {
            query_id: queryId,
            accept_duckdb_execution: true
          }))
        })
        .then(() => reportId)
    })).then((reportId) => {
      cy.visit(`${appUrl}/reports/${reportId}/source`)
      cy.assertDatasetRows('Query 1', 2)
      cy.assertDatasetTable('Query 1', ['name', 'longitude', 'latitude'], ['Berlin'])
    })
  })
})
