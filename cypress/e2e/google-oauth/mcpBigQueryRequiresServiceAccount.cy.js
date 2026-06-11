/* eslint-disable no-undef */
import { AuthState, RedirectState } from 'dekart-proto/dekart_pb'

const appUrl = Cypress.env('DEKART_E2E_BASE_URL') || 'http://localhost:3000'
const ciValue = String(Cypress.env('CI') ?? '').toLowerCase()
const isCI = ciValue === 'true' || ciValue === '1' || String(Cypress.env('CYPRESS_CI') ?? '') === '1'
const apiBase = isCI ? `${appUrl}/api/v1` : 'http://localhost:8080/api/v1'
const serviceAccountError = 'BigQuery via MCP requires a service-account-backed connection'

const bytesToBase64 = (bytes) => {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

const base64ToBytes = (value) => {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

const getAccessToken = () => {
  const state = new AuthState()
  state.setAction(AuthState.Action.ACTION_REQUEST_CODE)
  state.setUiUrl(appUrl)
  state.setAuthUrl(`${apiBase}/authenticate`)
  const stateBase64 = bytesToBase64(state.serializeBinary())

  return cy.request({
    url: `${apiBase}/authenticate?state=${encodeURIComponent(stateBase64)}`,
    followRedirect: false,
    failOnStatusCode: false
  }).then((response) => {
    expect(response.status, 'authenticate redirect status').to.eq(302)
    const location = response.headers.location
    expect(location, 'authenticate redirect location').to.be.a('string')
    const redirectStateBase64 = new URL(location).searchParams.get('redirect_state')
    expect(redirectStateBase64, 'redirect_state').to.be.a('string')
    const redirectState = RedirectState.deserializeBinary(base64ToBytes(redirectStateBase64))
    expect(redirectState.getError(), 'redirect error').to.eq('')
    const token = JSON.parse(redirectState.getTokenJson())
    expect(token.access_token, 'access_token').to.be.a('string')
    expect(token.access_token, 'access_token').not.to.eq('')
    return token.access_token
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

describe('google-oauth MCP BigQuery passthrough rejection', () => {
  it('rejects project-only BigQuery MCP create_connection', () => {
    const connectionName = `MCP BigQuery Passthrough Repro ${Date.now()}`

    getAccessToken().then((token) => {
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
})
