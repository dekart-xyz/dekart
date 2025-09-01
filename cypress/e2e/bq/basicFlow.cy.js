/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('basic query flow', () => {
  it('should make simple bigquery query and get ready status', () => {
    cy.visit('/')

    // create new report
    cy.get('button#dekart-create-report').click()

    // run query
    cy.get('button:contains("Run SQL")').click()
    cy.get('textarea').type(copy.simple_sql_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')
    cy.get(`span:contains("${copy.downloading}")`).should('contain', 'kB') // size of result shown
  })
})
