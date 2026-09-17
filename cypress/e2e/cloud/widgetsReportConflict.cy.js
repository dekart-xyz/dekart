/* global cy, describe, expect, it, Cypress */

describe('Widget report save reconciliation', () => {
  it('does not treat its own new DuckDB query as a concurrent report edit', () => {
    const email = `widgets-report-conflict-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
    cy.enterQuery("SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(5) t(i)")
    cy.contains('This report changed in another session').should('not.exist')
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).then(button => {
      if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
    })
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '5')
    cy.get('button#dekart-save-button').click()
    cy.get('button#dekart-save-button', { timeout: 30000 }).should('not.be.disabled')

    let saveHeld = false
    cy.intercept('POST', '**/Dekart/UpdateReport', () => {
      if (saveHeld) return
      saveHeld = true
      return new Cypress.Promise(resolve => setTimeout(resolve, 2000))
    }).as('updateReport')

    cy.get('button[aria-label="Chart actions"]').first().click()
    cy.contains('[role="menuitem"]', 'Edit chart').click()
    cy.get('#widget-title').clear().type('Saved row count')
    cy.contains('button', 'Back to charts').click()
    cy.wrap(null).should(() => expect(saveHeld).to.equal(true))
    cy.enterQuery("SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)")
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.wait(['@updateReport', '@updateReport'], { timeout: 30000 })
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('#dekart-query-execute-button').should('be.enabled')
    cy.contains('This report changed in another session').should('not.exist')
    cy.contains('Map changed').should('not.exist')
  })
})
