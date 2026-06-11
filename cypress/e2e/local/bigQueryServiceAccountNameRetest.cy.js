/* eslint-disable no-undef */

const setInputValue = (selector, value) => {
  cy.get(selector).then(($input) => {
    const el = $input[0]
    const proto = el.tagName === 'TEXTAREA'
      ? el.ownerDocument.defaultView.HTMLTextAreaElement.prototype
      : el.ownerDocument.defaultView.HTMLInputElement.prototype
    const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value').set
    valueSetter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new Event('blur', { bubbles: true }))
  })
}

const openBigQueryConnection = () => {
  cy.visit('/connections')

  cy.get('body', { timeout: 20000 }).should(($body) => {
    const ready = $body.find('#dekart-connection-type-card-bigquery').length > 0 ||
      $body.find('#dekart-new-connection-connections').length > 0 ||
      $body.find('#dekart-new-connection-onboarding').length > 0
    expect(ready, 'connection entry point should be visible').to.eq(true)
  }).then(($body) => {
    const onSelectorScreen = $body.find('#dekart-connection-type-card-bigquery').length > 0
    if (onSelectorScreen) {
      cy.get('#dekart-connection-type-card-bigquery', { timeout: 20000 }).click({ force: true })
      return
    }
    const onConnectionsPage = $body.find('#dekart-new-connection-connections').length > 0
    if (onConnectionsPage) {
      cy.get('#dekart-new-connection-connections', { timeout: 20000 }).click({ force: true })
    } else {
      cy.get('#dekart-new-connection-onboarding', { timeout: 20000 }).click({ force: true })
    }
    cy.get('#dekart-connection-type-card-bigquery', { timeout: 20000 }).click({ force: true })
  })
}

describe('bigquery connection name retest', () => {
  beforeEach(() => {
    cy.intercept('POST', '**/Dekart/TestConnection').as('testConnection')
  })

  it('enables test connection again after editing the service account connection name', () => {
    openBigQueryConnection()

    cy.contains('button', 'Configure Service Account', { timeout: 20000 }).click()
    cy.get('div.ant-modal-title', { timeout: 20000 }).should('contain', 'BigQuery Service Account')

    setInputValue('input#connectionName', 'BigQuery')
    setInputValue('textarea#newBigqueryKey', JSON.stringify({
      type: 'service_account',
      project_id: 'dekart-dev',
      private_key_id: 'invalid',
      private_key: 'invalid',
      client_email: 'invalid@example.com',
      client_id: 'invalid',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/invalid',
      universe_domain: 'googleapis.com'
    }))

    cy.get('button#testConnection').should('be.enabled').click()
    cy.wait('@testConnection', { timeout: 60000 })
    cy.get('.anticon-exclamation-circle, .anticon-check-circle', { timeout: 60000 }).should('be.visible')

    setInputValue('input#connectionName', 'BigQuery Edited')

    cy.get('button#testConnection').should('be.enabled')

    cy.get('button#testConnection').click()
    cy.wait('@testConnection', { timeout: 60000 })
    cy.get('.anticon-exclamation-circle, .anticon-check-circle', { timeout: 60000 }).should('be.visible')

    setInputValue('input#connectionName', '')

    cy.get('button#testConnection').should('be.enabled')
  })

  it('disables Google OAuth connection when OAuth is not configured', () => {
    openBigQueryConnection()

    cy.contains('button', 'Connect with Google', { timeout: 20000 })
      .should('be.disabled')
      .parent()
      .trigger('mouseover')
    cy.contains('.ant-tooltip-inner', 'Google OAuth is not configured for this Dekart instance', { timeout: 20000 }).should('be.visible')
    cy.contains('button', 'Configure Service Account').should('be.enabled')
  })
})
