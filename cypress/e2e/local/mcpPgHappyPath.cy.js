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

    const mcpCall = (apiBase, name, args = {}) => cy.request({
      method: 'POST',
      url: `${apiBase}/mcp/call`,
      body: { name, arguments: args },
      failOnStatusCode: false
    }).then((response) => {
      expect(response.status, `${name} http status`).to.eq(200)
      expect(response.body).to.have.property('result')
      return response.body.result
    })

    const pollJobDone = (apiBase, jobId, retries = 30) => {
      return cy.request({
        method: 'POST',
        url: `${apiBase}/mcp/call`,
        body: { name: 'check_job_status', arguments: { job_id: jobId } },
        failOnStatusCode: false
      }).then((response) => {
        if (response.status !== 200) {
          if (retries <= 0) {
            throw new Error(`check_job_status failed with status=${response.status}`)
          }
          cy.wait(1000)
          return pollJobDone(apiBase, jobId, retries - 1)
        }
        const result = response.body.result
        const job = result.query_job || result.queryJob || result
        const rawStatus = job.job_status ?? job.jobStatus ?? ''
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
        return pollJobDone(apiBase, jobId, retries - 1)
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
        expect(tokenResp.status).to.eq(200)
        expect(tokenResp.body.status, 'device token status').to.be.oneOf(['pending', 'authorized'])

        // 3) MCP flow: list connections -> create report -> create dataset -> create query -> update query -> run query.
        mcpCall(apiBase, 'list_connections').then((listResult) => {
          const connections = listResult.connections || listResult
          expect(connections, 'connections').to.be.an('array').and.not.be.empty
          const match = connections.find((c) => c.connection_name === connName || c.connectionName === connName)
          expect(match, `connection "${connName}" should exist`).to.exist
          const connectionId = match.id

          mcpCall(apiBase, 'create_report', {}).then((reportResult) => {
            const reportId = readId(reportResult, ['report_id', 'reportId', 'id']) ||
              readId(reportResult?.report, ['id'])
            expect(reportId, 'report_id').to.be.a('string').and.not.be.empty

            mcpCall(apiBase, 'create_dataset', { report_id: reportId }).then((datasetResult) => {
              const datasetId = readId(datasetResult, ['dataset_id', 'datasetId', 'id']) ||
                readId(datasetResult?.dataset, ['id'])
              expect(datasetId, 'dataset_id').to.be.a('string').and.not.be.empty

              mcpCall(apiBase, 'create_query', { dataset_id: datasetId, connection_id: connectionId }).then((queryResult) => {
                const queryId = readId(queryResult, ['query_id', 'queryId']) ||
                  readId(queryResult?.query, ['id'])
                expect(queryId, 'query_id').to.be.a('string').and.not.be.empty

                const sql = 'SELECT * FROM sample.geospatial_points LIMIT 100'
                mcpCall(apiBase, 'update_query', { query_id: queryId, query_text: sql }).then(() => {
                  mcpCall(apiBase, 'run_query', { query_id: queryId }).then((runResult) => {
                    const queryJob = runResult.query_job || runResult.queryJob
                    const jobId = queryJob?.id
                    expect(jobId, 'job_id').to.be.a('string').and.not.be.empty

                    pollJobDone(apiBase, jobId).then(() => {
                      // 4) User verifies report has query results.
                      cy.visit(`${appUrl}/reports/${reportId}/source`)
                      cy.contains('span', 'Ready', { timeout: 120000 }).should('be.visible')
                      cy.get('div:contains("100 rows")', { timeout: 120000 }).should('be.visible')
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
