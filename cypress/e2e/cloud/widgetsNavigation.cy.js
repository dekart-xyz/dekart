// Regression: Charts disappear after opening another map without reloading.
/* global cy, describe, it, Cypress */

// Create independent saved maps before exercising navigation between them.
function createMap (title, count) {
  cy.visit('/')
  cy.get('#dekart-create-report', { timeout: 30000 }).click()
  cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
  cy.enterQuery(`SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(${count}) t(i)`)
  cy.get('#dekart-query-execute-button').should('be.enabled').click()
  cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
  cy.get('[data-testid="widgets-tab"]').then(button => {
    if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
  })
  cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', String(count))
  cy.get('[title="Click to edit map title"]').click()
  cy.get('#dekart-report-title-input').clear().type(`${title}{enter}`)
  cy.get('[title="Click to edit map title"]').should('contain.text', title)
  cy.get('button#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
}

// Follow the visible menu when the header moves navigation into its overflow.
function openMyMaps () {
  cy.get('.ant-menu-horizontal').then(menu => {
    // Overflowed items remain in the header but cannot receive hover events.
    if (!menu.find('[id="dekart-main-menu"]:visible').length) {
      cy.wrap(menu).find('.ant-menu-overflow-item-rest').trigger('mouseover')
    }
  })
  cy.get('[id="dekart-main-menu"]:visible').trigger('mouseover')
  cy.contains('a:visible', 'My Maps').click()
}

describe('Charts across map navigation', () => {
  it('renders each saved map and its filters without reloading the page', () => {
    cy.viewport(1280, 960)
    const email = `widgets-navigation-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    createMap('Navigation map A', 6)
    createMap('Navigation map B', 8)
    cy.visit('/')
    cy.contains('.dekart-map-card h3', 'Navigation map A', { timeout: 30000 }).click()
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '6')
    cy.window().then(win => { win.navigationReproduction = true })
    openMyMaps()
    cy.contains('.dekart-map-card h3', 'Navigation map B', { timeout: 30000 }).click()
    cy.window().its('navigationReproduction').should('eq', true)
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '8')
    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').first().click()
    cy.get('[data-testid="number-value"]').should('have.text', '4')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'category')
    cy.get('[data-testid="error-message-text"]').should('not.exist')
    openMyMaps()
    cy.contains('.dekart-map-card h3', 'Navigation map A', { timeout: 30000 }).click()
    cy.window().its('navigationReproduction').should('eq', true)
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '6')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'No filters')
    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').first().click()
    cy.get('[data-testid="number-value"]').should('have.text', '3')
    cy.get('[data-testid="error-message-text"]').should('not.exist')
  })
})
