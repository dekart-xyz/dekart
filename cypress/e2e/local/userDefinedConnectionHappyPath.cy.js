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

    cy.get('body', { timeout: 20000 }).should(($body) => {
      const text = $body.text()
      expect(text, 'connections page should render expected actions').to.match(/Postgres|New Connection|New connection/)
    }).then(($body) => {
      if ($body.find('button:contains("New Connection"), button:contains("New connection")').length > 0) {
        cy.contains('button', /New Connection|New connection/, { timeout: 20000 }).click({ force: true })
        cy.contains('Postgres', { timeout: 20000 }).closest('button').click({ force: true })
        return
      }
      if ($body.text().includes('Postgres')) {
        cy.contains('Postgres', { timeout: 20000 }).closest('button').click({ force: true })
        return
      }
    })

    cy.get('div.ant-modal-title', { timeout: 20000 }).should('contain', 'Postgres')
    setInputValue('input#connectionName', connName)
    setInputValue('input#postgresHost', 'localhost')
    setInputValue('input#postgresUsername', 'postgres')
    setInputValue('input#postgresPassword', 'dekart')
    setInputValue('input#postgresDatabase', 'dekart_geo')
    setInputValue('input#postgresPort', '5432')

    cy.contains('button', 'Test Connection').click()
    cy.wait('@testConnection')
    cy.get('button#saveConnection', { timeout: 60000 }).should('be.enabled').click()
    cy.wait('@createConnection').then((interception) => {
      const grpcStatus = interception.response?.headers?.['grpc-status']
      const grpcMessage = interception.response?.headers?.['grpc-message']
      expect(grpcStatus, `CreateConnection grpc-status, message=${grpcMessage || ''}`).to.satisfy((s) => s === undefined || s === '0')
    })

    cy.visit('http://localhost:3000/')
    cy.get('button#dekart-create-report', { timeout: 20000 }).click()
    cy.contains('button', connName, { timeout: 60000 }).click({ force: true })
    cy.get('textarea', { timeout: 20000 }).type(copy.simple_pg_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.wait('@runQuery', { timeout: 120000 }).its('response.statusCode').should('eq', 200)
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.get('div:contains("1 rows")', { timeout: 120000 }).should('be.visible')
  })
})
