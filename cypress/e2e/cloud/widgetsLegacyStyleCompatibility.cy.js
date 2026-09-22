/* global cy, describe, it, Cypress, expect */

describe('Widgets legacy style compatibility', () => {
  it('keeps the query Execute icon aligned with its label', () => {
    const email = `widgets-styles-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
    cy.get('[data-testid="widgets-tab"]').click()
    cy.contains('button', 'Add chart', { timeout: 30000 }).should('be.visible')
    cy.get('#dekart-query-execute-button').then(button => {
      const icon = button[0].querySelector('.anticon').getBoundingClientRect()
      const label = button[0].querySelector('.anticon + span').getBoundingClientRect()
      expect(Math.abs((icon.top + icon.height / 2) - (label.top + label.height / 2)), 'Execute icon and label centers').to.be.lessThan(1.5)
    })
  })
})
