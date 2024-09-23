/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('happy path', () => {
  it('should make simple snowflake query and get ready status', () => {
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.get('textarea').type(copy.simple_snowflake_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')
    cy.get('div:contains("100 rows")', { timeout: 20000 }).should('be.visible')
  })
})
