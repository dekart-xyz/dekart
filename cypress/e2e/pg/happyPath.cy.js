/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'
console.log('happy path')
describe('happy path', () => {
  it('should make simple postgres query and get ready status', () => {
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.get('button:contains("Add data from...")').click()
    cy.get('span:contains("SQL query")').click()
    cy.get('textarea').type(copy.simple_pg_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')
    cy.get('div:contains("1 rows")', { timeout: 20000 }).should('be.visible')
  })
})
