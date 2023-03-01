/* global cy */
import copy from '../../fixtures/copy.json'

describe('basic query flow', () => {
  it('should make simple athena query and get ready status', () => {
    cy.visit('/')
    cy.get(`button:contains("${copy.create_report}")`).click()
    cy.get(`button:contains("${copy.athena_query}")`).click()
    cy.get('textarea').type(copy.simple_athena_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')
    cy.get(`span:contains("${copy.downloading}")`).should('contain', 'kB') // size of result shown
  })
})

describe('cancelling query', () => {
  it('should cancels query', () => {
    cy.visit('/')
    cy.get(`button:contains("${copy.create_report}")`).click()
    cy.get(`button:contains("${copy.athena_query}")`).click()
    cy.get('textarea').type(copy.simple_athena_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`button:contains("${copy.execute}")`).should('be.disabled')
    cy.get(`button:contains("${copy.cancel}")`).should('be.visible')
    cy.get(`button:contains("${copy.cancel}")`).click()
    cy.get(`button:contains("${copy.execute}")`).should('be.enabled')
    cy.get('#dekart-query-status-message').should('be.empty')
  })
})
