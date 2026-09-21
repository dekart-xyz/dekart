/* eslint-disable no-undef */

const apiOrigin = Cypress.env('DEKART_E2E_API_URL')
const apiBase = `${apiOrigin}/api/v1`
const workspaceId = '00000000-0000-0000-0000-000000000000'
const toolNames = [
  'list_connections', 'create_report', 'create_dataset', 'create_query', 'update_query',
  'run_query', 'check_job_status', 'remove_dataset', 'create_file', 'replace_file',
  'update_report_title', 'update_report_map_config', 'get_map_config_schema',
  'update_report_widgets_config', 'get_widgets_config_schema',
  'add_report_readme', 'update_report_readme', 'remove_report_readme',
  'update_dataset_name', 'get_report_properties', 'create_report_snapshot',
  'start_file_upload_session', 'complete_file_upload_session', 'abort_file_upload_session'
]

// callMCP sends authenticated or public tool calls while preserving error responses for assertions.
const callMCP = (token, name, args = {}) => cy.request({
  method: 'POST',
  url: `${apiBase}/mcp/call`,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  body: { name, arguments: args },
  failOnStatusCode: false
})

// result unwraps a successful MCP response with a useful tool-specific assertion message.
function result (response, name) {
  expect(response.status, `${name}: ${JSON.stringify(response.body)}`).to.eq(200)
  expect(response.body).to.have.property('result')
  return response.body.result
}

// getDeviceToken authenticates every role through the user-visible device flow.
function getDeviceToken (email, deviceName) {
  return cy.request('POST', `${apiBase}/device`, { device_name: deviceName }).then((start) => {
    cy.setDevClaimsEmail(email)
    cy.visit(start.body.auth_url)
    cy.contains('button', 'Authorize', { timeout: 20000 }).click()
    cy.contains('Device authorized', { timeout: 20000 }).should('be.visible')
    return cy.request('POST', `${apiBase}/device/token`, { device_id: start.body.device_id })
  }).then((response) => {
    expect(response.body.status).to.eq('authorized')
    return response.body.token
  })
}

// setRole replaces the current default-workspace role without changing the device token.
function setRole (email, role) {
  return cy.exec(`sqlite3 data/dekart.db "DELETE FROM workspace_log WHERE email='${email}'; INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role) VALUES ('${workspaceId}', '${email}', 1, '${email}', lower(hex(randomblob(16))), ${role})"`)
}

// createReport returns the report ID needed by the capability fixtures.
const createReport = (token) => callMCP(token, 'create_report').then((r) => result(r, 'create_report').report.id)
// createDataset returns a writable dataset ID under the requested report.
const createDataset = (token, reportId) => callMCP(token, 'create_dataset', { report_id: reportId }).then((r) => result(r, 'create_dataset').id)
// createQuery creates a connection-free DuckDB query for permission and refresh cases.
const createQuery = (token, datasetId) => callMCP(token, 'create_query', {
  dataset_id: datasetId,
  execution_engine: 'QUERY_EXECUTION_ENGINE_DUCKDB'
}).then((r) => result(r, 'create_query').query_id)

// mapConfig builds the smallest valid point-layer config used by the color regression.
function mapConfig (datasetId, color) {
  return JSON.stringify({
    version: 'v1',
    config: {
      visState: {
        layers: [{
          id: 'customer-points',
          type: 'point',
          config: {
            dataId: datasetId,
            label: 'Customer points',
            color,
            columns: { lat: 'latitude', lng: 'longitude' },
            isVisible: true,
            visConfig: {}
          },
          visualChannels: { colorScale: 'ordinal' }
        }],
        filters: []
      }
    }
  })
}

// widgetsConfig builds the smallest valid chart document keyed by one dashboard id.
function widgetsConfig (dashboardId) {
  return JSON.stringify({
    version: 1,
    provider: 'sqlrooms',
    config: {
      dashboardsById: {
        [dashboardId]: {
          id: dashboardId,
          title: 'Widgets',
          panelOrder: ['row-count'],
          panels: [{ id: 'row-count', type: 'vgplot', title: 'Rows', config: { chartType: 'number', settings: { operation: 'count' } } }]
        }
      }
    }
  })
}

// mutationCalls supplies valid resources and the canonical denial status for each shared mutation.
function mutationCalls (r) {
  return [
    ['create_dataset', { report_id: r.reportId }, 403],
    ['create_query', { dataset_id: r.emptyDatasetId, execution_engine: 'QUERY_EXECUTION_ENGINE_DUCKDB' }, 404],
    ['update_query', { query_id: r.queryId, query_text: 'SELECT 2' }, 403],
    ['remove_dataset', { dataset_id: r.removableDatasetId }, 404],
    ['create_file', { dataset_id: r.fileDatasetId }, 404],
    ['replace_file', { dataset_id: r.fileDatasetId }, 404],
    ['update_report_title', { report_id: r.reportId, title: 'Blocked title' }, 403],
    ['update_report_map_config', { report_id: r.reportId, map_config: mapConfig(r.mapDatasetId, [255, 0, 0]) }, 403],
    ['update_report_widgets_config', { report_id: r.reportId, widgets_config: widgetsConfig(r.mapDatasetId) }, 403],
    ['add_report_readme', { report_id: r.reportId, markdown: 'Blocked' }, 403],
    ['update_report_readme', { report_id: r.reportId, markdown: 'Blocked' }, 403],
    ['remove_report_readme', { report_id: r.reportId }, 403],
    ['update_dataset_name', { dataset_id: r.mapDatasetId, name: 'Blocked' }, 404],
    ['start_file_upload_session', { file_id: r.fileId, name: 'blocked.geojson', mime_type: 'application/geo+json', total_size: 10 }, 404],
    ['complete_file_upload_session', { file_id: r.fileId, upload_session_id: r.sessionId, parts: [{ part_number: 1, etag: 'blocked', size: 10 }], total_size: 10 }, 404],
    ['abort_file_upload_session', { file_id: r.fileId, upload_session_id: r.sessionId }, 404]
  ]
}

// expectMutationsDenied verifies both capability denial and child-resource concealment semantics.
function expectMutationsDenied (token, resources, identity) {
  cy.wrap(mutationCalls(resources)).each(([name, args, expectedStatus]) => {
    callMCP(token, name, args).then((response) => {
      expect(response.status, `${identity} ${name}: ${JSON.stringify(response.body)}`).to.eq(expectedStatus)
    })
  })
}

// uploadFixture exercises either successful completion or successful abortion of a real upload session.
function uploadFixture (token, fileId, abort) {
  return cy.readFile('cypress/fixtures/sample.geojson', 'utf8').then((body) => {
    const totalSize = Cypress.Buffer.byteLength(body)
    return callMCP(token, 'start_file_upload_session', {
      file_id: fileId,
      name: 'sample.geojson',
      mime_type: 'application/geo+json',
      total_size: totalSize
    }).then((response) => {
      const session = result(response, 'start_file_upload_session')
      if (abort) {
        return callMCP(token, 'abort_file_upload_session', {
          file_id: fileId,
          upload_session_id: session.upload_session_id
        }).then((r) => result(r, 'abort_file_upload_session'))
      }
      return cy.request({
        method: 'PUT',
        url: `${apiOrigin}${session.upload_part_endpoint.replace('{part_number}', '1')}?part_size=${totalSize}`,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/geo+json' },
        body
      }).then((part) => callMCP(token, 'complete_file_upload_session', {
        file_id: fileId,
        upload_session_id: session.upload_session_id,
        parts: [part.body],
        total_size: totalSize
      })).then((r) => result(r, 'complete_file_upload_session'))
    })
  })
}

// expectNewVersion polls the agent read path until a browser save has rotated the report version.
function expectNewVersion (token, reportId, previousVersionId, attempts = 20) {
  return callMCP(token, 'get_report_properties', { report_id: reportId }).then((r) => {
    const properties = result(r, 'preserved get_report_properties')
    if (properties.report.version_id !== previousVersionId) return properties
    expect(attempts, 'browser save rotated the report version').to.be.greaterThan(1)
    return cy.wait(500).then(() => expectNewVersion(token, reportId, previousVersionId, attempts - 1))
  })
}

describe('MCP report capabilities', () => {
  it('applies Viewer and Editor permissions consistently to every tool', () => {
    const runId = Date.now()
    const ownerEmail = `mcp-owner-${runId}@example.com`
    const collaboratorEmail = `mcp-collaborator-${runId}@example.com`
    const authorEmail = `mcp-author-${runId}@example.com`
    const expiredWorkspaceId = '00000000-0000-0000-0000-000000000901'
    let ownerToken
    let collaboratorToken
    let authorToken
    let resources
    let queryJobId

    cy.exec(`sqlite3 data/dekart.db "INSERT OR IGNORE INTO workspaces (id, name, is_default) VALUES ('${workspaceId}', 'Default', 1)"`)
    setRole(ownerEmail, 2)
    setRole(collaboratorEmail, 2)
    setRole(authorEmail, 2)

    getDeviceToken(ownerEmail, `mcp-owner-${runId}`).then((token) => {
      ownerToken = token
      return getDeviceToken(collaboratorEmail, `mcp-collaborator-${runId}`)
    }).then((token) => {
      collaboratorToken = token
      return getDeviceToken(authorEmail, `mcp-author-${runId}`)
    }).then((token) => {
      authorToken = token
      return createReport(ownerToken)
    }).then((reportId) => createDataset(ownerToken, reportId).then((mapDatasetId) => {
      const originalMapConfig = mapConfig(mapDatasetId, [0, 204, 153])
      return callMCP(ownerToken, 'update_report_map_config', { report_id: reportId, map_config: originalMapConfig })
        .then((r) => result(r, 'update_report_map_config'))
        .then(() => createDataset(ownerToken, reportId))
        .then((emptyDatasetId) => createDataset(ownerToken, reportId).then((removableDatasetId) => {
          return createDataset(ownerToken, reportId).then((fileDatasetId) => {
            return createDataset(ownerToken, reportId).then((queryDatasetId) => createQuery(ownerToken, queryDatasetId).then((queryId) => {
              return callMCP(ownerToken, 'update_query', { query_id: queryId, query_text: 'SELECT 1 AS saved' })
                .then((r) => result(r, 'update_query'))
                .then(() => callMCP(ownerToken, 'create_file', { dataset_id: fileDatasetId }))
                .then((r) => {
                  resources = {
                    reportId,
                    mapDatasetId,
                    emptyDatasetId,
                    removableDatasetId,
                    fileDatasetId,
                    queryId,
                    fileId: result(r, 'create_file').file_id,
                    sessionId: '00000000-0000-0000-0000-000000000001',
                    originalMapConfig
                  }
                })
            }))
          })
        }))
    })).then(() => cy.exec(`sqlite3 data/dekart.db "UPDATE reports SET allow_edit=1, discoverable=1 WHERE id='${resources.reportId}'"`))
      .then(() => setRole(collaboratorEmail, 3))
      .then(() => cy.exec(`sqlite3 -json data/dekart.db "SELECT map_config, updated_at, version_id, (SELECT COUNT(*) FROM report_snapshots WHERE report_id='${resources.reportId}') snapshot_count, (SELECT COUNT(*) FROM datasets WHERE report_id='${resources.reportId}') dataset_count FROM reports WHERE id='${resources.reportId}'"`))
      .then(({ stdout }) => {
        const before = JSON.parse(stdout)[0]
        expectMutationsDenied(collaboratorToken, resources, 'viewer')
        cy.then(() => cy.exec(`sqlite3 -json data/dekart.db "SELECT map_config, updated_at, version_id, (SELECT COUNT(*) FROM report_snapshots WHERE report_id='${resources.reportId}') snapshot_count, (SELECT COUNT(*) FROM datasets WHERE report_id='${resources.reportId}') dataset_count FROM reports WHERE id='${resources.reportId}'"`)).then(({ stdout: after }) => {
          expect(JSON.parse(after)[0]).to.deep.eq(before)
          expect(before.map_config).to.eq(resources.originalMapConfig)
        })
      })

    cy.then(() => createReport(authorToken)).then((reportId) => {
      return setRole(authorEmail, 3).then(() => callMCP(authorToken, 'update_report_title', {
        report_id: reportId,
        title: 'Viewer author cannot change this'
      }))
    }).then((response) => {
      expect(response.status, JSON.stringify(response.body)).to.eq(403)
      return setRole(collaboratorEmail, 2)
    }).then(() => cy.exec(`sqlite3 data/dekart.db "UPDATE reports SET allow_edit=0 WHERE id='${resources.reportId}'"`)).then(() => {
      expectMutationsDenied(collaboratorToken, resources, 'editor without report edit access')
    })

    cy.then(() => cy.exec(`sqlite3 data/dekart.db "UPDATE reports SET allow_edit=1 WHERE id='${resources.reportId}'"`))
      .then(() => callMCP(collaboratorToken, 'get_report_properties', { report_id: resources.reportId }))
      .then((r) => {
        expect(result(r, 'editor get_report_properties').report.can_write).to.eq(true)
      })
      .then(() => callMCP(collaboratorToken, 'update_report_title', { report_id: resources.reportId, title: 'Shared report' }))
      .then((r) => result(r, 'update_report_title'))
      .then(() => callMCP(collaboratorToken, 'update_report_map_config', { report_id: resources.reportId, map_config: mapConfig(resources.mapDatasetId, [30, 144, 255]) }))
      .then((r) => result(r, 'update_report_map_config'))
      .then(() => callMCP(collaboratorToken, 'add_report_readme', { report_id: resources.reportId, markdown: 'Notes' }))
      .then((r) => result(r, 'add_report_readme'))
      .then(() => callMCP(collaboratorToken, 'update_report_readme', { report_id: resources.reportId, markdown: 'Updated notes' }))
      .then((r) => result(r, 'update_report_readme'))
      .then(() => callMCP(collaboratorToken, 'remove_report_readme', { report_id: resources.reportId }))
      .then((r) => result(r, 'remove_report_readme'))
      .then(() => callMCP(collaboratorToken, 'update_dataset_name', { dataset_id: resources.mapDatasetId, name: 'Customer points' }))
      .then((r) => result(r, 'update_dataset_name'))
      .then(() => createDataset(collaboratorToken, resources.reportId))
      .then((id) => createQuery(collaboratorToken, id))
      .then(() => createDataset(collaboratorToken, resources.reportId))
      .then((id) => callMCP(collaboratorToken, 'remove_dataset', { dataset_id: id }))
      .then((r) => result(r, 'remove_dataset'))
      .then(() => callMCP(collaboratorToken, 'update_query', { query_id: resources.queryId, query_text: 'SELECT 1 AS saved' }))
      .then((r) => result(r, 'update_query'))
      .then(() => callMCP(collaboratorToken, 'run_query', { query_id: resources.queryId, accept_duckdb_execution: true }))
      .then((r) => {
        queryJobId = result(r, 'run_query').query_job.id
        return callMCP(collaboratorToken, 'check_job_status', { job_id: queryJobId })
      }).then((r) => result(r, 'check_job_status'))
      .then(() => callMCP(collaboratorToken, 'create_file', { dataset_id: resources.emptyDatasetId }))
      .then((r) => result(r, 'create_file'))
      .then(() => callMCP(collaboratorToken, 'replace_file', { dataset_id: resources.fileDatasetId }))
      .then((r) => result(r, 'replace_file'))
      .then(() => createDataset(collaboratorToken, resources.reportId))
      .then((id) => callMCP(collaboratorToken, 'create_file', { dataset_id: id }))
      .then((r) => uploadFixture(collaboratorToken, result(r, 'create_file for upload').file_id, false))
      .then(() => createDataset(collaboratorToken, resources.reportId))
      .then((id) => callMCP(collaboratorToken, 'create_file', { dataset_id: id }))
      .then((r) => uploadFixture(collaboratorToken, result(r, 'create_file for abort').file_id, true))

    cy.then(() => callMCP(collaboratorToken, 'get_report_properties', { report_id: resources.reportId })).then((r) => result(r, 'get_report_properties'))
      .then(() => callMCP(collaboratorToken, 'create_report_snapshot', { report_id: resources.reportId })).then((r) => result(r, 'create_report_snapshot'))
      .then(() => callMCP(collaboratorToken, 'list_connections')).then((r) => result(r, 'list_connections'))
      .then(() => setRole(collaboratorEmail, 3))
      .then(() => cy.exec(`sqlite3 -json data/dekart.db "SELECT query_text FROM queries WHERE id='${resources.queryId}'"`))
      .then(({ stdout }) => callMCP(collaboratorToken, 'run_query', { query_id: resources.queryId, accept_duckdb_execution: true }).then((r) => {
        result(r, 'viewer run_query')
        return cy.exec(`sqlite3 -json data/dekart.db "SELECT query_text FROM queries WHERE id='${resources.queryId}'"`)
      }).then(({ stdout: after }) => expect(JSON.parse(after)[0].query_text).to.eq(JSON.parse(stdout)[0].query_text)))
      .then(() => callMCP(collaboratorToken, 'get_report_properties', { report_id: resources.reportId })).then((r) => result(r, 'viewer get_report_properties'))
      .then(() => callMCP(collaboratorToken, 'create_report_snapshot', { report_id: resources.reportId })).then((r) => result(r, 'viewer create_report_snapshot'))
      .then(() => callMCP(collaboratorToken, 'list_connections')).then((r) => result(r, 'viewer list_connections'))
      .then(() => callMCP(collaboratorToken, 'check_job_status', { job_id: queryJobId })).then((r) => result(r, 'viewer check_job_status'))
      .then(() => callMCP(collaboratorToken, 'create_report')).then((r) => expect(r.status).to.eq(403))
      .then(() => callMCP(collaboratorToken, 'create_connection')).then((r) => expect(r.status).to.eq(412))
      .then(() => setRole(collaboratorEmail, 2))
      .then(() => callMCP(collaboratorToken, 'create_connection')).then((r) => expect(r.status).to.eq(412))
      .then(() => cy.exec(`sqlite3 data/dekart.db "INSERT INTO subscription_log (workspace_id, authored_by, plan_type, trial_ends_at, created_at) VALUES ('${workspaceId}', '${collaboratorEmail}', 6, datetime('now', '-1 day'), datetime('now', '+1 minute'))"`))
      .then(() => callMCP(collaboratorToken, 'create_report_snapshot', { report_id: resources.reportId })).then((r) => result(r, 'read-only workspace snapshot'))
      .then(() => callMCP(collaboratorToken, 'update_report_title', { report_id: resources.reportId, title: 'Read-only blocked' })).then((r) => expect(r.status).to.eq(403))
      .then(() => cy.exec(`sqlite3 data/dekart.db "DELETE FROM subscription_log WHERE workspace_id='${workspaceId}' AND authored_by='${collaboratorEmail}'"`))
      .then(() => createReport(ownerToken))
      .then((reportId) => cy.exec(`sqlite3 data/dekart.db "INSERT OR IGNORE INTO workspaces (id, name, is_default) VALUES ('${expiredWorkspaceId}', 'Expired report workspace', 0); UPDATE reports SET workspace_id='${expiredWorkspaceId}' WHERE id='${reportId}'; INSERT INTO subscription_log (workspace_id, authored_by, plan_type, trial_ends_at, created_at) VALUES ('${expiredWorkspaceId}', '${ownerEmail}', 6, datetime('now', '-1 day'), datetime('now', '+1 minute'))"`).then(() => reportId))
      .then((reportId) => callMCP(ownerToken, 'add_report_readme', { report_id: reportId, markdown: 'Must stay blocked' }).then((r) => {
        expect(r.status).to.eq(403)
        return callMCP(ownerToken, 'update_report_widgets_config', { report_id: reportId, widgets_config: widgetsConfig('11111111-1111-4111-8111-111111111111') })
      }))
      .then((r) => expect(r.status).to.eq(403))
      .then(() => cy.exec(`sqlite3 data/dekart.db "DELETE FROM subscription_log WHERE workspace_id='${expiredWorkspaceId}' AND authored_by='${ownerEmail}'"`))
      .then(() => callMCP(null, 'get_map_config_schema')).then((r) => result(r, 'public get_map_config_schema'))
      .then(() => callMCP(null, 'get_widgets_config_schema')).then((r) => {
        const schema = result(r, 'public get_widgets_config_schema')
        expect(schema.schema_id).to.eq('inmemory://widgets_config_v1.schema.json')
        expect(schema.title).to.eq('Dekart Widgets Config v1')
      })
      .then(() => callMCP(null, 'get_report_properties', { report_id: resources.reportId })).then((r) => expect(r.status).to.eq(401))
      .then(() => cy.request('GET', `${apiBase}/mcp/tools`)).then((r) => {
        expect(r.body.tools.map((tool) => tool.name).sort()).to.deep.eq([...toolNames].sort())
      })
  })

  it('preserves stored widgets_config the browser cannot parse', () => {
    const runId = Date.now()
    const email = `mcp-widgets-${runId}@example.com`
    const dashboardId = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    // A setting the current client rejects stands in for a config written by a newer release.
    const seeded = JSON.stringify({
      version: 1,
      provider: 'sqlrooms',
      config: {
        dashboardsById: {
          [dashboardId]: {
            id: dashboardId,
            title: 'Widgets',
            panelOrder: ['future-panel'],
            panels: [{ id: 'future-panel', type: 'vgplot', title: 'Future', config: { chartType: 'count-plot', settings: { field: 'status', futureSetting: 'v2' } } }]
          }
        }
      }
    })
    let token

    cy.exec(`sqlite3 data/dekart.db "INSERT OR IGNORE INTO workspaces (id, name, is_default) VALUES ('${workspaceId}', 'Default', 1)"`)
    setRole(email, 2)
    getDeviceToken(email, `mcp-widgets-${runId}`).then((deviceToken) => {
      token = deviceToken
      return createReport(token)
    }).then((reportId) => {
      cy.exec(`sqlite3 data/dekart.db "UPDATE reports SET widgets_config='${seeded.replace(/"/g, '\\"')}' WHERE id='${reportId}'"`)
      cy.setDevClaimsEmail(email)
      cy.visit(`/reports/${reportId}/source`)
      cy.get('[data-testid="widgets-tab"]', { timeout: 60000 }).click()
      cy.contains('[role="alert"]', 'Invalid persisted widget configuration', { timeout: 60000 }).should('be.visible')
      // Any browser save must leave the unparseable config untouched; a new version proves the save landed.
      cy.then(() => callMCP(token, 'get_report_properties', { report_id: reportId })).then((r) => {
        const before = result(r, 'seeded get_report_properties').report.version_id
        cy.get('#dekart-save-button').should('not.be.disabled').click()
        expectNewVersion(token, reportId, before).then((properties) => {
          expect(properties.report.widgets_config).to.eq(seeded)
        })
      })
    })
  })
})
