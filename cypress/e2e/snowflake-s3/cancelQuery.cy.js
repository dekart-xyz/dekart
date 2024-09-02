/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('cancelling query', () => {
  it('should cancels query', () => {
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.get('button:contains("Add data from...")').click()
    cy.get('span:contains("SQL query")').click()
    cy.get('textarea').type(copy.simple_snowflake_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`button:contains("${copy.cancel}")`).should('be.visible')
    cy.get(`button:contains("${copy.cancel}")`).click()
    cy.get(`button:contains("${copy.execute}")`).should('be.enabled')
    cy.get('#dekart-query-status-message').should('be.empty')
  })
})
