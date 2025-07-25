/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('basic query flow', () => {
  it('should make simple bigquery query and get ready status', () => {
    cy.visit('/')

    // create new report
    cy.get('button#dekart-create-report').click()

    // click #dekart-add-connection
    cy.get('#dekart-add-connection').click()

    // create connection
    cy.get('button:contains("BigQuery")').click()
    cy.get('button:contains("Connect with Google")').click()
    const randomConnectionName = `test-${Math.floor(Math.random() * 1000000)}`
    cy.get('div.ant-modal-title').should('contain', 'BigQuery')
    cy.get('input#connectionName').clear()
    cy.get('input#connectionName').type(randomConnectionName)
    cy.get('input#bigqueryProjectId').clear() // prevent autofill
    cy.get('input#bigqueryProjectId').type('dekart-dev')
    cy.get('input#cloudStorageBucket').type('dekart-dev')
    cy.get('button:contains("Test Connection")').click()
    cy.get('button#saveConnection').should('be.enabled')
    cy.get('button#saveConnection').click()

    // run query
    cy.get('button:contains("Run SQL")').click()
    cy.get('textarea').type(copy.simple_sql_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')
    cy.get(`span:contains("${copy.downloading}")`).should('contain', 'kB') // size of result shown
  })
})
