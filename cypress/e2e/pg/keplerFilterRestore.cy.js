/* global cy, describe, it, Cypress */

const QUERY = "SELECT 52.5 + i / 100.0 AS latitude, 13.4 + i / 100.0 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category FROM generate_series(0, 5) t(i)"
const CATEGORY_BAR = '[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line'

// Native query results exercise the download/publication glue rather than DuckDB publication.
function execute (query) {
  cy.enterQuery(query)
  cy.get('#dekart-query-execute-button').should('be.enabled').click()
  cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
  cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')
}

describe('Kepler filter restoration across native query replacement', () => {
  it('restores the selection after an empty result and respects removal during that result', () => {
    cy.viewport(1280, 960)
    const email = `native-filter-restore-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'Run SQL', { timeout: 30000 }).click()
    execute(QUERY)
    cy.get('[data-testid="widgets-tab"]').then(button => {
      if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
    })
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '6')
    cy.get(CATEGORY_BAR).first().click()
    cy.get('[data-testid="number-value"]').should('have.text', '3')

    execute(`${QUERY} WHERE false`)
    cy.contains('Result is empty', { timeout: 30000 }).should('be.visible')
    execute(QUERY)
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'category')

    // Query errors must retain the authored selection for the next successful result.
    cy.enterQuery('SELECT * FROM missing_native_filter_restore_table')
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Error')
    execute(QUERY)
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')

    execute(`${QUERY} WHERE false`)
    cy.contains('Result is empty', { timeout: 30000 }).should('be.visible')
    cy.get('button[aria-label="Remove category filter"]').click()
    execute(QUERY)
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '6')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'No filters')
  })
})
