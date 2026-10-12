// Regression: Dataset replacement and error recovery lose widget selections and bar emphasis.
/* global cy, describe, it, Cypress, expect */

const QUERY = "SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category, i * 10 AS capacity_kw FROM range(6) t(i)"

function execute (query) {
  cy.enterQuery(query)
  cy.get('#dekart-query-execute-button').should('be.enabled').click()
  cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
  cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')
}

function assertSelection () {
  cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '2')
  cy.get('[data-testid="filter-strip"]').should('contain.text', 'category').and('contain.text', 'capacity kw')
  cy.get('[data-testid="filter-strip"] button[title]').contains('capacity kw').should('have.attr', 'title').and('include', '[0,35]')
  cy.get('[data-testid="category-chart"] g[aria-label="bar"] rect').should(bars => {
    const opacity = [...bars].map(bar => bar.ownerDocument.defaultView.getComputedStyle(bar).opacity)
    expect(opacity).to.include('1').and.to.include('0.25')
  })
}

describe('Widget and Kepler filters across DuckDB re-runs', () => {
  it('preserves both values and emphasis through replacement and an empty error result', () => {
    cy.viewport(1280, 960)
    const email = `widgets-reload-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
    execute(QUERY)
    cy.get('[data-testid="widgets-tab"]').then(button => {
      if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
    })
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '6')
    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').first().click()
    cy.get('[data-testid="number-value"]').should('have.text', '3')
    cy.get('[data-testid="filter-strip"]').find('button[aria-label="Add filter"]').click()
    cy.get('.field-selector .item-selector').first().click()
    cy.contains('.field-selector_list-item', 'capacity_kw').click()
    cy.get('.kg-range-slider__input').last().clear().type('35{enter}')
    cy.get('[data-testid="widgets-tab"]').click()
    assertSelection()
    execute(`${QUERY} WHERE i >= 0`)
    assertSelection()

    // An unavailable result empties Kepler's domain before a later run publishes real rows.
    cy.enterQuery('SELECT * FROM missing_widget_reload_table')
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Error')
    execute(QUERY)
    assertSelection()

    // Recovery must not resurrect a filter the editor deliberately removes during an error.
    cy.enterQuery('SELECT * FROM missing_widget_reload_table')
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Error')
    cy.get('button[aria-label="Remove category filter"]').should('be.enabled')
    cy.get('button[aria-label="Remove category filter"]').click()
    cy.get('[data-testid="filter-strip"]').should('not.contain.text', 'category')
    execute(QUERY)
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '4')
    cy.get('[data-testid="filter-strip"]').should('not.contain.text', 'category').and('contain.text', 'capacity kw')
  })
})
