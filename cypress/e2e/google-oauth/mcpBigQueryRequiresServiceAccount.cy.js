/* eslint-disable no-undef */

const apiBase = `${Cypress.env('DEKART_E2E_API_URL')}/api/v1`
const createConnectionDisabledError = 'create_connection via MCP is disabled; create the connection in Dekart UI first'

const getDeviceToken = () => cy.mcpDeviceToken('test@gmail.com', { deviceName: 'cypress-google-oauth-mcp' })

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
  it('rejects MCP create_connection until secret retrieval is supported', () => {
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
        expect(response.body, 'create_connection error').to.eq(`${createConnectionDisabledError}\n`)
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
