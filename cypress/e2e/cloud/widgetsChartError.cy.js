/* global cy, describe, it, Cypress */

describe('Chart source errors', () => {
  it('shows a generic chart failure and reloads the page', () => {
    const email = `widgets-chart-error-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
    cy.enterQuery('SELECT 52.5 AS latitude, 13.4 AS longitude FROM range(1)')
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '1')

    cy.enterQuery('SELECT * FROM missing_chart_error_table')
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('[data-testid="widget-item"] [role="alert"]', { timeout: 120000 })
      .should('contain.text', "This chart couldn't load. Reload the page.")
      .and('not.contain.text', 'DuckDB SQL can only read report datasets')
      .and('not.contain.text', 'missing_chart_error_table')
    cy.get('[data-testid="widget-item"]').should('not.contain.text', 'Open data')

    let previousDocument
    cy.document().then(document => { previousDocument = document })
    cy.get('[data-testid="widget-item"] [role="alert"] button').contains('Reload the page.').click()
    cy.document().should('not.equal', previousDocument)
  })
})
