/* eslint-disable no-undef */

describe('local MCP postgres happy path with device auth', () => {
  it('configures postgres in UX, authorizes device, executes MCP flow, and verifies map data in UI', () => {
    const appUrl = Cypress.env('DEKART_E2E_BASE_URL') || 'http://localhost:3000'
    const ciValue = String(Cypress.env('CI') ?? '').toLowerCase()
    const isCI = ciValue === 'true' || ciValue === '1' || String(Cypress.env('CYPRESS_CI') ?? '') === '1'
    const apiBase = isCI ? `${appUrl}/api/v1` : 'http://localhost:8080/api/v1'
    const connName = `Postgres MCP Local ${Date.now()}`

    const setInputValue = (selector, value) => {
      cy.get(selector).then(($input) => {
        const el = $input[0]
        const valueSetter = Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView.HTMLInputElement.prototype, 'value').set
        valueSetter.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        el.dispatchEvent(new Event('blur', { bubbles: true }))
      })
    }
    const readId = (obj, candidates) => {
      for (const key of candidates) {
        const value = obj?.[key]
        if (typeof value === 'string' && value.length > 0) return value
      }
      return ''
    }

    const mcpRequest = (apiBase, token, name, args = {}) => cy.request({
      method: 'POST',
      url: `${apiBase}/mcp/call`,
      headers: { Authorization: `Bearer ${token}` },
      body: { name, arguments: args },
      failOnStatusCode: false
    })

    const mcpCall = (apiBase, token, name, args = {}) => mcpRequest(apiBase, token, name, args).then((response) => {
      expect(response.status, `${name} http status: ${JSON.stringify(response.body)}`).to.eq(200)
      expect(response.body).to.have.property('result')
      return response.body.result
    })

    const pollJobDone = (apiBase, token, jobId, retries = 30) => {
      return mcpRequest(apiBase, token, 'check_job_status', { job_id: jobId }).then((response) => {
        if (response.status !== 200) {
          if (retries <= 0) {
            throw new Error(`check_job_status failed with status=${response.status}`)
          }
          cy.wait(1000)
          return pollJobDone(apiBase, token, jobId, retries - 1)
        }
        const job = response.body.result.query_job
        const rawStatus = job.job_status ?? ''
        const normalizeStatus = (value) => {
          if (typeof value === 'number') return value
          if (typeof value !== 'string') return -1
          if (value === 'JOB_STATUS_DONE' || value === 'DONE') return 4
          if (value === 'JOB_STATUS_UNSPECIFIED' || value === 'UNSPECIFIED') return 0
          if (value === 'JOB_STATUS_PENDING' || value === 'PENDING') return 1
          if (value === 'JOB_STATUS_RUNNING' || value === 'RUNNING') return 2
          if (value === 'JOB_STATUS_READING_RESULTS' || value === 'READING_RESULTS') return 3
          return Number.isNaN(Number(value)) ? -1 : Number(value)
        }
        const status = normalizeStatus(rawStatus)
        if (status === 4) {
          return job
        }
        // JOB_STATUS_UNSPECIFIED => failed
        if (status === 0) {
          throw new Error(`query job failed: ${job.job_error || job.jobError || 'unknown'}`)
        }
        if (retries <= 0) {
          throw new Error(`query job timeout; last status=${status}`)
        }
        cy.wait(1000)
        return pollJobDone(apiBase, token, jobId, retries - 1)
      })
    }

    cy.intercept('POST', '**/Dekart/TestConnection').as('testConnection')
    cy.intercept('POST', '**/Dekart/CreateConnection').as('createConnection')

    // 1) Configure local Postgres connection in UX.
    cy.visit(`${appUrl}/connections`)
    cy.get('body', { timeout: 20000 }).should(($body) => {
      const ready = $body.find('#dekart-connection-type-card-postgres').length > 0 ||
        $body.find('#dekart-new-connection-connections').length > 0 ||
        $body.find('#dekart-new-connection-onboarding').length > 0
      expect(ready, 'connection entry point should be visible').to.eq(true)
    }).then(($body) => {
      const onSelectorScreen = $body.find('#dekart-connection-type-card-postgres').length > 0
      if (onSelectorScreen) {
        cy.get('#dekart-connection-type-card-postgres', { timeout: 20000 }).click({ force: true })
        return
      }
      const onConnectionsPage = $body.find('#dekart-new-connection-connections').length > 0
      if (onConnectionsPage) {
        cy.get('#dekart-new-connection-connections', { timeout: 20000 }).click({ force: true })
      } else {
        cy.get('#dekart-new-connection-onboarding', { timeout: 20000 }).click({ force: true })
      }
      cy.get('#dekart-connection-type-card-postgres', { timeout: 20000 }).click({ force: true })
    })

    cy.get('div.ant-modal-title', { timeout: 20000 }).should('contain', 'Postgres')
    setInputValue('input#connectionName', connName)
    setInputValue('input#postgresHost', 'localhost')
    setInputValue('input#postgresUsername', 'postgres')
    setInputValue('input#postgresPassword', 'dekart')
    setInputValue('input#postgresDatabase', 'dekart_geo')
    setInputValue('input#postgresPort', '5432')
    cy.get('button#testConnection').click()
    cy.wait('@testConnection')
    cy.get('button#saveConnection', { timeout: 60000 }).should('be.enabled').click()
    cy.wait('@createConnection')

    // 2) Device auth flow to obtain MCP bearer token.
    cy.request('POST', `${apiBase}/device`, { device_name: 'cypress-local-mcp' }).then((startResp) => {
      expect(startResp.status).to.eq(200)
      const deviceId = startResp.body.device_id
      const authUrl = startResp.body.auth_url
      expect(deviceId, 'device_id').to.be.a('string').and.not.be.empty
      expect(authUrl, 'auth_url').to.be.a('string').and.include('/device/authorize')

      cy.visit(authUrl)
      cy.contains('button', 'Authorize', { timeout: 20000 }).click()
      cy.contains('Device authorized', { timeout: 20000 }).should('be.visible')
      cy.contains('Your CLI now has access.').should('be.visible')
      cy.contains('button', 'Manage tokens').should('be.visible')

      cy.request('POST', `${apiBase}/device/token`, { device_id: deviceId }).then((tokenResp) => {
        expect(tokenResp.body.status, 'device token status').to.eq('authorized')
        const token = tokenResp.body.token
        expect(token, 'device token').to.be.a('string').and.not.be.empty

        // 3) MCP flow: list connections -> create report -> create dataset -> create query -> update query -> run query.
        mcpCall(apiBase, token, 'list_connections').then((listResult) => {
          const connections = listResult.connections || listResult
          expect(connections, 'connections').to.be.an('array').and.not.be.empty
          const match = connections.find((c) => c.connection_name === connName || c.connectionName === connName)
          expect(match, `connection "${connName}" should exist`).to.exist
          const connectionId = match.id

          mcpCall(apiBase, token, 'create_report', {}).then((reportResult) => {
            const reportId = readId(reportResult, ['report_id', 'reportId', 'id']) ||
              readId(reportResult?.report, ['id'])
            expect(reportId, 'report_id').to.be.a('string').and.not.be.empty

            // Seed the saved declaration because the CLI sends values, not duplicate schemas.
            cy.exec(`sqlite3 data/dekart.db "UPDATE reports SET query_params=json_array(json_object('name','row_limit','label','Rows','type',1,'default_value','100')), updated_at=CURRENT_TIMESTAMP WHERE id='${reportId}'"`)

            mcpCall(apiBase, token, 'create_dataset', { report_id: reportId }).then((datasetResult) => {
              const datasetId = readId(datasetResult, ['dataset_id', 'datasetId', 'id']) ||
                readId(datasetResult?.dataset, ['id'])
              expect(datasetId, 'dataset_id').to.be.a('string').and.not.be.empty

              mcpCall(apiBase, token, 'update_dataset_name', { dataset_id: datasetId, name: 'Source' })
              mcpCall(apiBase, token, 'create_query', { dataset_id: datasetId, connection_id: connectionId }).then((queryResult) => {
                const queryId = readId(queryResult, ['query_id', 'queryId']) ||
                  readId(queryResult?.query, ['id'])
                expect(queryId, 'query_id').to.be.a('string').and.not.be.empty

                const sql = 'SELECT * FROM sample.geospatial_points LIMIT {{row_limit}}'
                mcpCall(apiBase, token, 'update_query', { query_id: queryId, query_text: sql }).then(() => {
                  mcpCall(apiBase, token, 'run_query', {
                    query_id: queryId,
                    query_params_values: 'qp_row_limit=7'
                  }).then((connectionRun) => {
                    expect(connectionRun.execution_engine).to.eq('QUERY_EXECUTION_ENGINE_CONNECTION')
                    const connectionJob = connectionRun.query_job
                    return pollJobDone(apiBase, token, connectionJob.id)
                  })
                  mcpCall(apiBase, token, 'update_query', {
                    query_id: queryId,
                    query_text: 'SELECT \'prepared\' AS source_revision, p.* FROM sample.geospatial_points p LIMIT {{row_limit}}'
                  })
                  let duckQueryId
                  mcpCall(apiBase, token, 'create_dataset', { report_id: reportId }).then((duckDatasetResult) => {
                    const duckDatasetId = readId(duckDatasetResult, ['dataset_id', 'datasetId', 'id'])
                    mcpCall(apiBase, token, 'update_dataset_name', { dataset_id: duckDatasetId, name: 'Result' })
                    return mcpCall(apiBase, token, 'create_query', {
                      dataset_id: duckDatasetId,
                      execution_engine: 'QUERY_EXECUTION_ENGINE_DUCKDB'
                    }).then((duckQueryResult) => {
                      duckQueryId = readId(duckQueryResult, ['query_id', 'queryId'])
                      const duckSQL = 'SELECT ST_Point(longitude, latitude) AS geometry, * FROM datasets."Source" LIMIT CAST({{row_limit}} AS INTEGER)'
                      return mcpCall(apiBase, token, 'update_query', { query_id: duckQueryId, query_text: duckSQL }).then((updateResult) => {
                        expect(updateResult.dry_run?.valid, 'DuckDB validation').to.eq(true)

                        mcpCall(apiBase, token, 'update_query', { query_id: duckQueryId, query_text: duckSQL }).then((unchangedResult) => {
                          expect(unchangedResult.updated ?? false, 'unchanged DuckDB update').to.eq(false)
                          expect(unchangedResult.dry_run?.valid, 'stored DuckDB validation').to.eq(true)
                        })

                        const rejectStaleDuckDBUpdate = () => {
                          cy.exec('sqlite3 data/dekart.db "DROP TRIGGER IF EXISTS mcp_duckdb_update_race"')
                          cy.exec(`sqlite3 data/dekart.db "CREATE TRIGGER mcp_duckdb_update_race AFTER UPDATE ON reports WHEN NEW.id='${reportId}' AND NEW.updated_at=OLD.updated_at BEGIN UPDATE queries SET query_text='SELECT 2', query_source_id='ffffffffffffffffffffffffffffffffffffffff' WHERE id='${duckQueryId}'; END"`)
                          return mcpRequest(apiBase, token, 'update_query', {
                            query_id: duckQueryId,
                            query_text: `${duckSQL} `
                          }).then((response) => {
                            expect(response.status, 'stale DuckDB update status').to.eq(409)
                            expect(response.body).to.eq('query was not updated\n')
                            return cy.exec('sqlite3 data/dekart.db "DROP TRIGGER mcp_duckdb_update_race"')
                          })
                        }

                        const rejectWithoutOptIn = (acceptDuckDBExecution) => mcpRequest(apiBase, token, 'run_query', {
                          query_id: duckQueryId,
                          ...(acceptDuckDBExecution === undefined ? {} : { accept_duckdb_execution: acceptDuckDBExecution })
                        }).then((response) => {
                          expect(response.status, 'DuckDB run without opt-in').to.eq(400)
                          expect(response.body).to.eq('DuckDB queries must use RunDuckDBQuery\n')
                        })

                        return rejectStaleDuckDBUpdate()
                          .then(() => rejectWithoutOptIn(undefined))
                          .then(() => rejectWithoutOptIn(false))
                          .then(() => {
                            // Rejection must not launch the changed warehouse prerequisite.
                            cy.visit(`${appUrl}/reports/${reportId}/source?qp_row_limit=7`)
                            cy.contains('.source-data-title .dataset-name', 'Source', { timeout: 120000 }).then($name => {
                              const section = $name.closest('.source-data-title').parent().parent()
                              section.find('.show-data-table svg')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
                            })
                            cy.get('#dataset-modal .header-cell[title]', { timeout: 30000 }).then($headers => {
                              const titles = [...$headers].map(header => header.getAttribute('title'))
                              expect(titles).not.to.include('source_revision')
                            })
                            cy.get('.modal--close').click()
                          })
                          .then(() => mcpCall(apiBase, token, 'run_query', {
                            query_id: duckQueryId,
                            query_params_values: 'qp_row_limit=7',
                            accept_duckdb_execution: true
                          }))
                          .then((prepared) => {
                            const rootJob = prepared.query_job
                            const execution = prepared.duckdb_execution
                            expect(rootJob.dataset_id).to.eq(duckDatasetId)
                            expect(rootJob.job_status).to.eq('JOB_STATUS_DONE')
                            expect(execution.duckdb_version).to.eq('1.4.3')
                            expect(execution.extensions).to.deep.equal([
                              { name: 'spatial', repository: 'core' },
                              { name: 'parquet', repository: 'core' },
                              { name: 'json', repository: 'core' },
                              { name: 'h3', repository: 'community' }
                            ])
                            expect(execution.statements).to.be.an('array').and.not.be.empty
                            expect(execution.sources).to.have.length(1)
                            const sourceJobId = execution.sources[0].query_job_id
                            expect(sourceJobId).to.be.a('string').and.not.be.empty
                            return pollJobDone(apiBase, token, sourceJobId)
                          })
                      })
                    })
                  }).then(() => {
                    // The same pinned jobs materialize in the browser runtime.
                    cy.visit(`${appUrl}/reports/${reportId}/source?qp_row_limit=7`)
                    cy.contains('span', 'Ready', { timeout: 120000 }).should('be.visible')
                    cy.get('div:contains("7 rows")', { timeout: 120000 }).should('have.length.at.least', 2)
                    cy.contains('.source-data-title .dataset-name', 'Result', { timeout: 120000 }).then($name => {
                      const section = $name.closest('.source-data-title').parent().parent()
                      section.find('.show-data-table svg')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
                    })
                    cy.get('#dataset-modal .header-cell[title]', { timeout: 30000 }).then($headers => {
                      const titles = [...$headers].map(header => header.getAttribute('title'))
                      expect(titles).to.include.members(['geometry', 'source_revision', 'longitude'])
                    })
                    cy.get('.modal--close').click()

                    // Exercise the existing browser command with the same saved parameter identity.
                    mcpCall(apiBase, token, 'update_query', {
                      query_id: duckQueryId,
                      query_text: 'SELECT \'browser\' AS browser_revision, ST_Point(longitude, latitude) AS geometry, * FROM datasets."Source" LIMIT CAST({{row_limit}} AS INTEGER)'
                    })
                    cy.contains('[role="tab"]', 'Result').click({ force: true })
                    cy.get('.ace_editor:visible .ace_content').should('contain.text', 'browser_revision')
                    cy.intercept('POST', '**/Dekart/RunDuckDBQuery').as('browserDuckDBRun')
                    cy.get('#dekart-query-execute-button').should('be.enabled').click()
                    cy.wait('@browserDuckDBRun')
                    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
                    cy.assertDatasetTable('Result', ['browser_revision'], ['browser'])

                    // A catalog change after a warehouse leaf is accepted aborts preparation.
                    const slowSQL = 'SELECT p.* FROM sample.geospatial_points p CROSS JOIN (SELECT pg_sleep(3)) delay LIMIT {{row_limit}}'
                    mcpCall(apiBase, token, 'update_query', { query_id: queryId, query_text: slowSQL })
                    mcpCall(apiBase, token, 'create_dataset', { report_id: reportId }).then((raceDatasetResult) => {
                      const raceDatasetId = readId(raceDatasetResult, ['dataset_id', 'datasetId', 'id'])
                      mcpCall(apiBase, token, 'update_dataset_name', { dataset_id: raceDatasetId, name: 'Race' })
                      return mcpCall(apiBase, token, 'create_query', {
                        dataset_id: raceDatasetId,
                        execution_engine: 'QUERY_EXECUTION_ENGINE_DUCKDB'
                      }).then((raceQueryResult) => {
                        const raceQueryId = readId(raceQueryResult, ['query_id', 'queryId'])
                        return mcpCall(apiBase, token, 'update_query', {
                          query_id: raceQueryId,
                          query_text: 'SELECT * FROM datasets."Source"'
                        }).then(() => {
                          cy.exec('sqlite3 data/dekart.db "DROP TRIGGER IF EXISTS mcp_duckdb_catalog_race"')
                          cy.exec(`sqlite3 data/dekart.db "CREATE TRIGGER mcp_duckdb_catalog_race AFTER INSERT ON query_jobs WHEN NEW.query_id='${queryId}' BEGIN UPDATE datasets SET updated_at=datetime('now','+5 seconds') WHERE id='${raceDatasetId}'; END"`)
                          return mcpRequest(apiBase, token, 'run_query', {
                            query_id: raceQueryId,
                            query_params_values: 'qp_row_limit=7',
                            accept_duckdb_execution: true
                          }).then((response) => {
                            expect(response.status, 'catalog race status').to.eq(409)
                            expect(response.body).to.eq('report changed during DuckDB preparation\n')
                            cy.exec('sqlite3 data/dekart.db "DROP TRIGGER mcp_duckdb_catalog_race"')
                          })
                        })
                      })
                    })

                    // The saved parameter schema participates in the same preparation snapshot.
                    mcpCall(apiBase, token, 'create_dataset', { report_id: reportId }).then((paramsRaceDatasetResult) => {
                      const paramsRaceDatasetId = readId(paramsRaceDatasetResult, ['dataset_id', 'datasetId', 'id'])
                      mcpCall(apiBase, token, 'update_dataset_name', { dataset_id: paramsRaceDatasetId, name: 'Params Race' })
                      return mcpCall(apiBase, token, 'create_query', {
                        dataset_id: paramsRaceDatasetId,
                        execution_engine: 'QUERY_EXECUTION_ENGINE_DUCKDB'
                      }).then((paramsRaceQueryResult) => {
                        const paramsRaceQueryId = readId(paramsRaceQueryResult, ['query_id', 'queryId'])
                        return mcpCall(apiBase, token, 'update_query', {
                          query_id: paramsRaceQueryId,
                          query_text: 'SELECT * FROM datasets."Source" LIMIT CAST({{row_limit}} AS INTEGER)'
                        }).then(() => {
                          cy.exec('sqlite3 data/dekart.db "DROP TRIGGER IF EXISTS mcp_duckdb_params_race"')
                          cy.exec(`sqlite3 data/dekart.db "CREATE TRIGGER mcp_duckdb_params_race AFTER INSERT ON query_jobs WHEN NEW.query_id='${queryId}' BEGIN UPDATE reports SET query_params=json_array(json_object('name','row_limit','label','Changed while running','type',1,'default_value','100')) WHERE id='${reportId}'; END"`)
                          return mcpRequest(apiBase, token, 'run_query', {
                            query_id: paramsRaceQueryId,
                            query_params_values: 'qp_row_limit=7',
                            accept_duckdb_execution: true
                          }).then((response) => {
                            expect(response.status, 'parameter-schema race status').to.eq(409)
                            expect(response.body).to.eq('report changed during DuckDB preparation\n')
                            cy.exec('sqlite3 data/dekart.db "DROP TRIGGER mcp_duckdb_params_race"')
                            cy.exec(`sqlite3 data/dekart.db "UPDATE reports SET query_params=json_array(json_object('name','row_limit','label','Rows','type',1,'default_value','100')) WHERE id='${reportId}'"`)
                          })
                        })
                      })
                    })

                    // If a later source fails MCP credential validation, the first leaf stays visible.
                    const suffix = Date.now().toString(16).padStart(12, '0').slice(-12)
                    const badConnectionId = `ffffffff-ffff-4fff-8fff-${suffix}`
                    const badDatasetId = `ffffffff-fffe-4fff-8fff-${suffix}`
                    const badQueryId = `ffffffff-fffd-4fff-8fff-${suffix}`
                    mcpCall(apiBase, token, 'update_query', {
                      query_id: queryId,
                      query_text: 'SELECT \'partial\' AS refresh_marker, p.* FROM sample.geospatial_points p LIMIT {{row_limit}}'
                    })
                    cy.contains('[role="tab"]', 'Source').click({ force: true })
                    cy.get('.ace_editor:visible .ace_content').should('contain.text', 'refresh_marker')
                    cy.exec(`sqlite3 data/dekart.db "INSERT INTO connections (id,connection_name,bigquery_project_id,connection_type) VALUES ('${badConnectionId}','Rejected BigQuery','project',1); INSERT INTO queries (id,query_text,query_source_id,query_source,execution_engine) VALUES ('${badQueryId}','SELECT 1','da39a3ee5e6b4b0d3255bfef95601890afd80709',1,1); INSERT INTO datasets (report_id,id,query_id,connection_id,name) VALUES ('${reportId}','${badDatasetId}','${badQueryId}','${badConnectionId}','Bad');"`)
                    mcpCall(apiBase, token, 'create_dataset', { report_id: reportId }).then((partialDatasetResult) => {
                      const partialDatasetId = readId(partialDatasetResult, ['dataset_id', 'datasetId', 'id'])
                      mcpCall(apiBase, token, 'update_dataset_name', { dataset_id: partialDatasetId, name: 'Partial' })
                      return mcpCall(apiBase, token, 'create_query', {
                        dataset_id: partialDatasetId,
                        execution_engine: 'QUERY_EXECUTION_ENGINE_DUCKDB'
                      }).then((partialQueryResult) => {
                        const partialQueryId = readId(partialQueryResult, ['query_id', 'queryId'])
                        return mcpCall(apiBase, token, 'update_query', {
                          query_id: partialQueryId,
                          query_text: 'SELECT * FROM datasets."Source" UNION ALL SELECT * FROM datasets."Bad"'
                        }).then(() => mcpRequest(apiBase, token, 'run_query', {
                          query_id: partialQueryId,
                          query_params_values: 'qp_row_limit=7',
                          accept_duckdb_execution: true
                        }).then((response) => {
                          expect(response.status, 'partial launch status').to.eq(412)
                          expect(response.body).to.deep.eq({
                            error: 'bigquery_passthrough_auth_required',
                            message: 'BigQuery passthrough requires local gcloud authorization',
                            hint: 'Upgrade Dekart CLI to a version that supports BigQuery passthrough, then run `dekart init` and follow the gcloud setup prompts.'
                          })
                          // The accepted Source leaf remains available in the browser despite the later rejection.
                          cy.assertDatasetRows('Source', 7)
                        }))
                      })
                    })
                  })
                })
              })
            })
          })
        })
      })
    })
  })
})
