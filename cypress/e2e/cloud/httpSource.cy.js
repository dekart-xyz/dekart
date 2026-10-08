/* eslint-disable no-undef */
import { Secret, UpdateConnectionRequest } from 'dekart-proto/dekart_pb'
import { createReport, replaceEditorText, editorShouldContain } from '../local/duckdbHelpers'

const baseURL = 'https://raw.githubusercontent.com/dekart-xyz/dekart/main/cypress/fixtures/'

// Frame a protobuf request exactly as the gRPC-web transport does.
function grpcFrame (message) {
  const data = message.serializeBinary()
  const frame = new Uint8Array(data.length + 5)
  new DataView(frame.buffer).setUint32(1, data.length)
  frame.set(data, 5)
  return frame
}

// Open the selector whether this workspace already has a connection or not.
function openHTTPSource () {
  cy.visit('/connections')
  cy.get('#dekart-connection-type-card-bigquery, #dekart-new-connection-connections, #dekart-new-connection-onboarding', { timeout: 30000 }).should('exist')
  cy.get('body').then($body => {
    if ($body.find('#dekart-new-connection-connections').length) {
      cy.get('#dekart-new-connection-connections').click()
    } else if ($body.find('#dekart-new-connection-onboarding').length) {
      cy.get('#dekart-new-connection-onboarding').click()
    }
  })
  cy.get('#dekart-connection-type-card-http', { timeout: 20000 }).click()
}

// Save a public fixture source with two harmless headers to exercise arbitrary rows.
function createHTTPSource () {
  openHTTPSource()
  cy.get('#connectionName').clear().type('HTTP fixtures')
  cy.get('#httpBaseUrl').type(baseURL)
  cy.get('#httpDocsUrl').type('https://example.com/docs')
  cy.contains('button', 'Add header').click()
  cy.get('#httpHeaderRows_0_name').type('X-Application-Id')
  cy.get('#httpHeaderRows_0_value').type('test-app')
  cy.contains('button', 'Add header').click()
  cy.get('#httpHeaderRows_1_name').type('X-Api-Key')
  cy.get('#httpHeaderRows_1_value').type('test-key')
  cy.get('#saveConnection').click()
  cy.get('.ant-modal').should('not.exist')
  cy.contains('HTTP fixtures', { timeout: 20000 }).should('be.visible')
}

describe('HTTP source connections and DuckDB downloads', () => {
  before(() => {
    cy.resetCloudTestDatabase()
    cy.setDevClaimsEmail('http-source@dekart.xyz')
    cy.visit('/')
    cy.ensureTestWorkspace()
    createReport()
    createHTTPSource()
  })

  beforeEach(() => cy.setDevClaimsEmail('http-source@dekart.xyz'))

  it('keeps supported HTTP sources out of connector requests', () => {
    cy.visit('/connections')
    cy.get('#dekart-new-connection-connections').click()
    cy.contains('Warehouses run queries in place; HTTP sources are fetched and published with your map.').should('be.visible')
    cy.get('#dekart-more-warehouses').click()
    cy.get('.ant-modal .ant-select').click()
    cy.get('.ant-select-dropdown:visible').should('not.contain', 'DuckDB / S3 / GCP')
    cy.contains('.ant-select-item-option', 'MotherDuck').click()
    cy.contains('.ant-modal button', 'Next').click()
    cy.contains('MotherDuck is in our pilot list').should('be.visible')
    cy.get('.ant-modal-close').click()
  })

  it('offers HTTP sources in SQL autocomplete', () => {
    createReport()
    cy.contains('button', 'DuckDB').click()
    replaceEditorText('SELECT * FROM read_')
    cy.get('.ace_editor:not(.ace_autocomplete):visible textarea').type('{ctrl} ', { force: true })
    cy.get('.ace_autocomplete:visible').should('contain.text', `read_json('${baseURL}`)
    cy.contains('.ace_autocomplete:visible', `read_json('${baseURL}`).click()
    editorShouldContain(`SELECT * FROM read_json('${baseURL}`)
  })

  it('hides saved headers and does not offer editing them', () => {
    cy.visit('/connections')
    cy.contains('HTTP fixtures', { timeout: 20000 }).click()
    cy.contains('Headers are hidden and cannot be edited after saving.').should('be.visible')
    cy.get('.ant-modal').should('not.contain', 'test-app').and('not.contain', 'test-key')
    cy.get('.ant-modal input[type="password"]').should('not.exist')
    cy.contains('.ant-modal button', 'Add header').should('not.exist')
    cy.get('#saveConnection').click()
    cy.get('.ant-modal').should('not.exist')
  })

  it('rejects a header update even when a client sends one directly', () => {
    cy.visit('/connections')
    cy.contains('HTTP fixtures', { timeout: 20000 }).click()
    cy.intercept('POST', '**/Dekart/UpdateConnection', req => {
      const bytes = Cypress.Buffer.from(req.body)
      const request = UpdateConnectionRequest.deserializeBinary(new Uint8Array(bytes.buffer, bytes.byteOffset + 5, bytes.length - 5))
      const secret = new Secret()
      secret.setClientEncrypted('not-an-encrypted-map')
      request.getConnection().setHttpHeadersJson(secret)
      req.body = Cypress.Buffer.from(grpcFrame(request))
    }).as('immutableHeaders')
    cy.get('#saveConnection').click()
    cy.wait('@immutableHeaders').then(({ response }) => {
      const body = Cypress.Buffer.from(response.body).toString('utf8')
      const status = response.headers['grpc-status'] || body.match(/grpc-status:\s*(\d+)/)[1]
      expect(status).to.eq('3')
      expect(decodeURIComponent(response.headers['grpc-message'] || body)).to.include('HTTP source headers cannot be edited after saving')
    })
    cy.contains('Bad Request').should('be.visible')
  })

  it('creates a DuckDB query from the HTTP source card and reads CSV', () => {
    createReport()
    cy.contains('button', 'HTTP fixtures').should('contain', 'raw.githubusercontent.com/dekart-xyz/dekart/main/cypress/fixtures').click()
    editorShouldContain(`SELECT * FROM read_json('${baseURL}')`)
    cy.intercept('GET', '**/api/v1/dataset-source/*/*').as('sourceDownload')
    replaceEditorText(`SELECT primary_type, latitude, longitude FROM read_csv('${baseURL}sample.csv')`)
    cy.get('#dekart-query-execute-button').click()
    cy.wait('@sourceDownload', { timeout: 120000 }).its('response.headers.cache-control').should('eq', 'private, max-age=3600')
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.assertDatasetRows('Query 1', 8276)
    cy.get('@sourceDownload').its('request.url').then(firstURL => {
      cy.get('#dekart-query-execute-button').click()
      cy.wait('@sourceDownload', { timeout: 120000 }).its('request.url').should('not.eq', firstURL)
    })
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('@sourceDownload').its('request.url').then(previousURL => {
      cy.get('#dekart-refresh-button').click()
      cy.contains('Refresh Now').click()
      cy.wait('@sourceDownload', { timeout: 30000 }).its('request.url').should('not.eq', previousURL)
    })
  })

  it('reads parquet and shows the unknown-host compiler error unchanged', () => {
    createReport()
    cy.contains('button', 'DuckDB').click()
    replaceEditorText(`SELECT primary_type, latitude, longitude FROM read_parquet('${baseURL}sample.parquet')`)
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.assertDatasetRows('Query 1', 8276)
    replaceEditorText("SELECT * FROM read_json('https://unknown.example/data')")
    cy.get('#dekart-query-execute-button').click()
    cy.contains('No HTTP source for unknown.example. Create one in Connections, or use a host from an existing HTTP source.').should('be.visible')
  })

  it('rejects a source id downloaded through another report', () => {
    createReport()
    cy.contains('button', 'DuckDB').click()
    cy.intercept('GET', '**/api/v1/dataset-source/*/*').as('ownedSource')
    replaceEditorText(`SELECT * FROM read_csv('${baseURL}sample.csv') LIMIT 1`)
    cy.get('#dekart-query-execute-button').click()
    cy.wait('@ownedSource', { timeout: 120000 }).its('request.url').then(sourceURL => {
      createReport()
      cy.contains('button', 'DuckDB').click()
      cy.intercept('GET', '**/api/v1/dataset-source/*/*').as('secondSource')
      replaceEditorText(`SELECT * FROM read_csv('${baseURL}sample.csv') LIMIT 1`)
      cy.get('#dekart-query-execute-button').click()
      cy.wait('@secondSource', { timeout: 120000 }).its('request.url').then(secondURL => {
        const foreignURL = new URL(secondURL)
        foreignURL.pathname = foreignURL.pathname.replace(/[^/]+$/, new URL(sourceURL).pathname.split('/').pop())
        cy.request({ url: foreignURL.toString(), headers: { 'X-Dekart-Claim-Email': 'http-source@dekart.xyz' }, failOnStatusCode: false }).its('status').should('eq', 404)
      })
    })
  })
})
