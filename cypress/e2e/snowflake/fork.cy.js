/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('fork', () => {
  it('should fork a shared report with empty query params', () => {
    cy.setDevClaimsEmail('test@gmail.com')
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.get('textarea').type('select 0 as lat, 0 as lon', { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')
    cy.get('div:contains("1 rows")', { timeout: 20000 }).should('be.visible')

    cy.get('button#dekart-share-report').click()
    cy.get('span:contains("No Access")').click()
    cy.get('div.dekart-share-view').click({ force: true })
    cy.get('button').contains('Done').click()

    cy.location('pathname').then((pathname) => {
      cy.setDevClaimsEmail('test2@gmail.com')
      cy.visit(`${pathname}/source`)
    })

    cy.get('button#dekart-fork-button').click()
    cy.get('span:contains("Fork of Untitled")').should('be.visible')
    cy.get('div:contains("1 rows")', { timeout: 20000 }).should('be.visible')
  })
})
