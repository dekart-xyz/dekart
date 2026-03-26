/* eslint-disable no-undef */

describe('OSS no-SSO smoke', () => {
  it('shows Login button and opens upgrade-to-SSO popup', () => {
    // Run this spec with no-SSO env, e.g.:
    // ELECTRON_RUN_AS_NODE= npx cypress run --spec "cypress/e2e/bq/noSSOSmoke.cy.js"
    // and server started from .env.oss-bigquery.
    cy.visit('/')

    cy.get('#dekart-login-button').should('be.visible')
    cy.get('#dekart-login-button').click()

    cy.contains('Login requires SSO').should('be.visible')
    cy.contains('Dekart is running in anonymous mode. To enable login, teams, and shared maps, your instance admin needs to configure SSO.').should('be.visible')
    cy.contains('button', 'Enable SSO on your instance').should('be.visible')
    cy.contains('Already have a license key?').should('be.visible')
    cy.contains('a', 'See setup docs →').should('be.visible')

    cy.get('.ant-modal-close').click()
    cy.get('.ant-modal-content').should('not.be.visible')
  })
})
