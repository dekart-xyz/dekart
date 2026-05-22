/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('self-hosted first setup happy flow', () => {
  it('shows ready-to-connect onboarding, supports file upload, and runs snowflake query', () => {
    const connName = `Snowflake Local ${Date.now()}`
    const snowflakeKey = Cypress.env('SNOWFLAKE_PRIVATE_KEY') || ''
    expect(snowflakeKey.length).to.be.greaterThan(100)

    cy.visit('http://localhost:3000/')
    cy.get('body', { timeout: 20000 }).then(($body) => {
      if ($body.text().includes('Ready to connect')) {
        cy.contains('Ready to connect').should('be.visible')
        cy.contains('button', 'New connection').should('be.visible')
        cy.contains('button', 'Use file upload').should('be.visible')
        cy.contains('button', 'Use file upload').click()
      } else {
        cy.get('button#dekart-create-report', { timeout: 20000 }).click()
      }
    })

    // O1: just file upload
    cy.contains('button', 'Upload File', { timeout: 20000 }).click()
    cy.get('input[type="file"]', { timeout: 20000 }).selectFile('cypress/fixtures/sample.csv', { force: true })
    cy.contains('button', 'Upload').click()
    cy.contains('Ready', { timeout: 120000 }).should('be.visible')

    // O2: create Snowflake connection
    cy.visit('http://localhost:3000/connections')
    cy.get('body', { timeout: 20000 }).then(($body) => {
      if ($body.find('button:contains("New Connection")').length > 0) {
        cy.contains('button', 'New Connection').click()
        cy.contains('div', 'Snowflake', { timeout: 20000 }).closest('button').click()
      } else {
        cy.contains('div', 'Snowflake', { timeout: 20000 }).closest('button').click()
      }
    })

    cy.get('input#connectionName', { timeout: 20000 }).clear().type(connName)
    cy.get('input#snowflakeAccountId').clear().type(Cypress.env('SNOWFLAKE_ACCOUNT_ID'))
    cy.get('input#snowflakeUsername').clear().type(Cypress.env('SNOWFLAKE_USER'))
    cy.get('input#snowflakeKey').then(($input) => {
      const el = $input[0]
      const valueSetter = Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView.HTMLInputElement.prototype, 'value').set
      valueSetter.call(el, snowflakeKey)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.dispatchEvent(new Event('blur', { bubbles: true }))
    })
    if (Cypress.env('SNOWFLAKE_WAREHOUSE')) {
      cy.get('input#snowflakeWarehouse').clear().type(Cypress.env('SNOWFLAKE_WAREHOUSE'))
    }
    cy.contains('button', 'Test Connection').click()
    cy.get('button#saveConnection', { timeout: 60000 }).should('be.enabled').click()

    // Use new connection in report and run SQL
    cy.visit('http://localhost:3000/')
    cy.get('button#dekart-create-report', { timeout: 20000 }).click()
    cy.contains(connName, { timeout: 20000 }).click()
    cy.get('textarea', { timeout: 20000 }).type(copy.simple_snowflake_query, { force: true })
    cy.contains('button', copy.execute).click()
    cy.contains('span', copy.ready, { timeout: 120000 }).should('be.visible')
    cy.contains('100 rows', { timeout: 60000 }).should('be.visible')
  })
})
