/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('pg-s3 happy path', () => {
  it('runs postgres query with s3-backed result storage', () => {
    cy.intercept('POST', '**/Dekart/RunQuery').as('runQuery')

    cy.visit('http://localhost:3000/')
    cy.get('body', { timeout: 30000 }).then(($body) => {
      if ($body.find('button#dekart-create-report').length > 0) {
        cy.get('button#dekart-create-report').click()
        return
      }
      if ($body.find('button:contains("New Map")').length > 0) {
        cy.contains('button', 'New Map').click({ force: true })
      }
    })
    cy.contains('button', 'Run SQL directly on Postgres', { timeout: 30000 }).click({ force: true })
    cy.get('textarea', { timeout: 30000 }).type(copy.simple_pg_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.wait('@runQuery', { timeout: 120000 }).its('response.statusCode').should('eq', 200)
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.get(`span:contains("${copy.downloading}")`, { timeout: 120000 }).should('contain', 'B')
  })
})
