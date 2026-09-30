/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('run all queries', () => {
  it('should run all queries', () => {
    cy.setDevClaimsEmail('bilonenko.v2@gmail.com')
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.get('textarea').type('SELECT ROUND(uniform(-90::float, 90::float, random()), 6) AS lat, ROUND(uniform(-180::float, 180::float, random()), 6) AS lon FROM TABLE(GENERATOR(ROWCOUNT => 10000))', { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.get('div:contains("10,000 rows")', { timeout: 120000 }).should('be.visible')

    cy.intercept('POST', '**/Dekart/RunAllQueries').as('runAllQueries')
    cy.intercept('GET', '**/api/v1/dataset-source/**').as('refreshedSource')
    cy.get('button#dekart-refresh-button').click()
    cy.get('#dekart-refresh-now-button').click()
    cy.wait('@runAllQueries').its('response.statusCode').should('eq', 200)
    cy.wait('@refreshedSource', { timeout: 120000 }).its('response.statusCode').should('eq', 200)
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('div:contains("10,000 rows")', { timeout: 120000 }).should('be.visible')
  })
})
