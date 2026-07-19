/* eslint-disable no-undef */
import { RedirectState } from 'dekart-proto/dekart_pb'

const postgresHost = '192.0.2.1'
const postgresPort = '50634'

function stubGoogleAccessToken (accessToken) {
  const redirectState = new RedirectState()
  redirectState.setTokenJson(JSON.stringify({ access_token: accessToken }))
  const encodedState = Cypress.Buffer.from(redirectState.serializeBinary()).toString('base64')
  cy.intercept('GET', '**/api/v1/authenticate*', (req) => {
    const url = new URL('/', Cypress.config('baseUrl'))
    url.searchParams.set('redirect_state', encodedState)
    req.redirect(url.toString())
  }).as('authenticate')
}

function setInputValue (selector, value) {
  cy.get(selector).then(($input) => {
    const el = $input[0]
    const valueSetter = Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView.HTMLInputElement.prototype, 'value').set
    valueSetter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new Event('blur', { bubbles: true }))
  })
}

function openPostgresConnectionModal () {
  cy.visit('/connections')
  cy.get('body', { timeout: 30000 }).should(($body) => {
    const ready = $body.find('#dekart-connection-type-card-postgres').length > 0 ||
      $body.find('#dekart-new-connection-connections').length > 0 ||
      $body.find('#dekart-new-connection-onboarding').length > 0 ||
      $body.find('#dekart-create-report').length > 0
    expect(ready, 'Postgres connection entry point should be visible').to.eq(true)
  }).then(($body) => {
    if ($body.find('#dekart-connection-type-card-postgres').length > 0) {
      cy.get('#dekart-connection-type-card-postgres', { timeout: 20000 }).click({ force: true })
      return
    }
    if ($body.find('#dekart-new-connection-connections').length > 0) {
      cy.get('#dekart-new-connection-connections').click({ force: true })
    } else if ($body.find('#dekart-create-report').length > 0) {
      cy.get('#dekart-create-report').click({ force: true })
      cy.contains('Add connection', { timeout: 20000 }).click({ force: true })
    } else {
      cy.get('#dekart-new-connection-onboarding').click({ force: true })
    }
    cy.get('#dekart-connection-type-card-postgres', { timeout: 20000 }).click({ force: true })
  })
}

describe('cloud Postgres connection host', () => {
  before(() => {
    cy.resetCloudTestDatabase()
  })

  it('uses the entered host when testing a connection', () => {
    if (Cypress.env('POSTGRES_TEST_ACCESS_TOKEN')) {
      stubGoogleAccessToken(Cypress.env('POSTGRES_TEST_ACCESS_TOKEN'))
    } else {
      cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN_INFO')
    }
    cy.intercept('POST', '**/Dekart/TestConnection').as('testConnection')
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('button#dekart-create-report', { timeout: 30000 }).should('be.visible')
    openPostgresConnectionModal()

    setInputValue('input#connectionName', 'Postgres host regression')
    setInputValue('input#postgresHost', postgresHost)
    setInputValue('input#postgresUsername', 'postgres')
    setInputValue('input#postgresPassword', 'invalid')
    setInputValue('input#postgresDatabase', 'railway')
    setInputValue('input#postgresPort', postgresPort)

    cy.get('button#testConnection').click()
    cy.wait('@testConnection', { timeout: 30000 })
    cy.get('.anticon-exclamation-circle').trigger('mouseover')
    cy.get('.ant-tooltip-inner')
      .should('contain', `${postgresHost}:${postgresPort}`)
      .and('not.contain', '[::1]')
  })
})
