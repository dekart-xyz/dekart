/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('postgres user-defined connection happy path', () => {
  it('creates postgres connection, saves it, and runs query via that connection', () => {
    const connName = `Postgres Local ${Date.now()}`
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

    cy.intercept('POST', '**/Dekart/TestConnection').as('testConnection')
    cy.intercept('POST', '**/Dekart/CreateConnection').as('createConnection')
    cy.intercept('POST', '**/Dekart/RunQuery').as('runQuery')

    cy.visit('http://localhost:3000/connections')

    cy.get('body', { timeout: 20000 }).then(($body) => {
      const onSelectorScreen = $body.find('#dekart-connection-type-card-postgres').length > 0
      if (onSelectorScreen) {
        cy.get('#dekart-connection-type-card-postgres', { timeout: 20000 }).click({ force: true })
        return
      }
      cy.get('#dekart-new-connection-connections', { timeout: 20000 }).click({ force: true })
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

    cy.visit('http://localhost:3000/')
    cy.get('button#dekart-create-report', { timeout: 20000 }).click()
    cy.contains('button', connName, { timeout: 60000 }).click({ force: true })
    cy.get('textarea', { timeout: 20000 }).type('SELECT * FROM sample.geospatial_points LIMIT 100', { force: true })
    cy.get('button#dekart-query-execute-button').click()
    cy.wait('@runQuery', { timeout: 120000 })
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.get('div:contains("100 rows")', { timeout: 120000 }).should('be.visible')
  })
})
