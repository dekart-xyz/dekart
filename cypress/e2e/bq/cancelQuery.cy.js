/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('cancelling query', () => {
  it('should cancels query', () => {
    cy.visit('/')

    // create new report
    cy.get('button#dekart-create-report').click()

    // run query
    cy.get('button:contains("Run SQL")').click()
    cy.get('textarea').type(copy.simple_sql_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()

    // cancel query
    cy.get(`button:contains("${copy.cancel}")`).should('be.visible')
    cy.get(`button:contains("${copy.cancel}")`).click()
    cy.get(`button:contains("${copy.execute}")`).should('be.enabled')
    cy.get('#dekart-query-status-message').should('be.empty')
  })
})
