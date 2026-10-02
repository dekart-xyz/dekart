/* global cy, describe, it, Cypress */

const QUERY = "SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)"

// Navigation must cancel an old publication before a new report can receive its recovery.
describe('filter recovery across report navigation', () => {
  it('rejects a held rerun after closing the report and opening a new one', () => {
    cy.viewport(1280, 960)
    const email = `filter-recovery-navigation-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
    cy.enterQuery(QUERY)
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('[data-testid="widgets-tab"]').then(button => {
      if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
    })
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '6')
    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').first().click()
    cy.get('[data-testid="number-value"]').should('have.text', '3')
    cy.get('button#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')

    // Leave recovery pending after a real unavailable result before navigating.
    cy.enterQuery('SELECT * FROM missing_navigation_recovery_table')
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Error')
    cy.enterQuery(QUERY)

    let release
    const gate = new Cypress.Promise(resolve => { release = resolve })
    let held = false
    cy.intercept('POST', '**/Dekart/RunDuckDBQuery', request => {
      if (!held) {
        held = true
        return gate.then(() => request.continue())
      }
      request.continue()
    })
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.wrap(null).should(() => { if (!held) throw new Error('Waiting for held rerun') })
    cy.get('#dekart-main-menu').trigger('mouseover')
    cy.contains('a', 'My Maps').click()
    cy.get('#dekart-create-report', { timeout: 30000 }).click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
    cy.then(() => release())
    cy.enterQuery(QUERY)
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('[data-testid="widgets-tab"]').then(button => {
      if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
    })
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '6')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'No filters')
    cy.get('button#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
    cy.reload()
    cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).click()
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '6')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'No filters')
  })
})
