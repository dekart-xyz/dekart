/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('cloud basic flow', () => {
  it('with private token', () => {
    // create connection
    cy.visit('/')
    cy.get('button:contains("BigQuery")').click()
    const randomConnectionName = `test-${Math.floor(Math.random() * 1000000)}`
    cy.get('div.ant-modal-title').should('contain', 'BigQuery')
    cy.get('input#connectionName').clear()
    cy.get('input#connectionName').type(randomConnectionName)
    cy.get('input#bigqueryProjectId').type('dekart-dev')
    cy.get('input#cloudStorageBucket').type('dekart-dev')
    cy.get('button:contains("Test Connection")').click()
    cy.get('button#saveConnection').should('be.enabled')
    cy.get('button#saveConnection').click()

    // create new report
    cy.get(`button:contains("${copy.create_report}")`).click()

    // run query
    cy.get('button:contains("Add data from...")').click()
    cy.get('span:contains("SQL query")').click()
    cy.get('textarea').type(copy.simple_sql_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')
    cy.get(`span:contains("${copy.downloading}")`).should('contain', 'kB') // size of result shown
  })
})
