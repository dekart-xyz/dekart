/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('basic query flow', () => {
  it('should make simple bigquery query and get ready status', () => {
    cy.visit('/')
    cy.get(`button:contains("${copy.create_report}")`).click()
    cy.get(`button:contains("${copy.bigquery_query}")`).click()
    cy.get('textarea').type(copy.simple_sql_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')
    cy.get(`span:contains("${copy.downloading}")`).should('contain', 'kB') // size of result shown
  })
})
