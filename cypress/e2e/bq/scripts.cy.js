/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('support bq scripts', () => {
  it('retrieve result for bigquery script', () => {
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.get('button:contains("Add data from...")').click()
    cy.get('span:contains("SQL query")').click()
    cy.get('textarea').type(copy.bigquery_script, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get('div:contains("1 rows")', { timeout: 20000 }).should('be.visible')
  })
})
