/* eslint-disable no-undef */

const appUrl = Cypress.env('DEKART_E2E_BASE_URL') || 'http://localhost:3000'
const ciValue = String(Cypress.env('CI') ?? '').toLowerCase()
const isCI = ciValue === 'true' || ciValue === '1' || String(Cypress.env('CYPRESS_CI') ?? '') === '1'
const apiBase = isCI ? `${appUrl}/api/v1` : 'http://localhost:8080/api/v1'
const serviceAccountError = 'BigQuery via MCP requires a service-account-backed connection'

const getDeviceToken = () => {
  return cy.request('POST', `${apiBase}/device`, {
    device_name: 'cypress-google-oauth-mcp'
  }).then((startResp) => {
    expect(startResp.status, 'device start status').to.eq(200)
    const deviceId = startResp.body.device_id
    const authUrl = startResp.body.auth_url
    expect(deviceId, 'device_id').to.be.a('string')
    expect(deviceId, 'device_id').not.to.eq('')
    expect(authUrl, 'auth_url').to.be.a('string').and.include('/device/authorize')

    cy.visit(authUrl)
    cy.contains('button', 'Authorize', { timeout: 20000 }).click()
    cy.contains('Device authorized', { timeout: 20000 }).should('be.visible')

    return cy.request('POST', `${apiBase}/device/token`, { device_id: deviceId }).then((tokenResp) => {
      expect(tokenResp.status, 'device token status').to.eq(200)
      expect(tokenResp.body.status, 'device token response status').to.eq('authorized')
      expect(tokenResp.body.token, 'device token').to.be.a('string')
      expect(tokenResp.body.token, 'device token').not.to.eq('')
      return tokenResp.body.token
    })
  })
}

const callMCP = (token, name, args = {}) => {
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
  })
}

const expectMCPError = (token, name, args, status, message) => {
  return callMCP(token, name, args).then((response) => {
    expect(response.status, `${name} http status`).to.eq(status)
    expect(response.body, `${name} error`).to.eq(`${message}\n`)
  })
}

describe('google-oauth MCP BigQuery passthrough rejection', () => {
  it('rejects project-only BigQuery MCP create_connection', () => {
    const connectionName = `MCP BigQuery Passthrough Repro ${Date.now()}`

    getDeviceToken().then((token) => {
      callMCP(token, 'create_connection', {
        connection: {
          connection_name: connectionName,
          connection_type: 'CONNECTION_TYPE_BIGQUERY',
          bigquery_project_id: 'dekart-cloud'
        }
      }).then((response) => {
        expect(response.status, 'create_connection http status').to.eq(412)
        expect(response.body, 'create_connection error').to.eq(`${serviceAccountError}\n`)
      })
    })
  })

  it('rejects empty and malformed query IDs before database UUID comparison', () => {
    getDeviceToken().then((token) => {
      expectMCPError(token, 'create_query', {
        dataset_id: '',
        connection_id: 'default'
      }, 400, 'dataset_id is required')

      expectMCPError(token, 'create_query', {
        dataset_id: 'not-a-uuid',
        connection_id: 'default'
      }, 400, 'invalid dataset_id format')

      expectMCPError(token, 'update_query', {
        query_id: '',
        query_text: 'select 1'
      }, 400, 'query_id is required')

      expectMCPError(token, 'update_query', {
        query_id: 'not-a-uuid',
        query_text: 'select 1'
      }, 400, 'invalid query_id format')

      expectMCPError(token, 'run_query', {
        query_id: ''
      }, 400, 'query_id is required')

      expectMCPError(token, 'run_query', {
        query_id: 'not-a-uuid'
      }, 400, 'invalid query_id format')
    })
  })
})
