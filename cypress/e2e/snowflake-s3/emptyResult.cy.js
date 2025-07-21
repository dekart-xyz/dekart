/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('empty path', () => {
  it('should complete query returning empty result', () => {
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.get('button:contains("Run SQL")').click()
    cy.get('textarea').type('SELECT ROUND(uniform(-90::float, 90::float, random()), 6) AS lat, ROUND(uniform(-180::float, 180::float, random()), 6) AS lon FROM TABLE(GENERATOR(ROWCOUNT => 0))', { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')
  })
})
