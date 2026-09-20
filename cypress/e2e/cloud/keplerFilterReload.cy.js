/* global cy, describe, it, Cypress, beforeEach */

const SIX_ROW_QUERY = "SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)"
const NINE_ROW_QUERY = "SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(9) t(i)"
// Each category row is drawn as a rule line; the first one is Alpha.
const CATEGORY_BAR = '[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line'

function createReportWithSixRows () {
  const email = `kepler-filter-reload-${Date.now()}@example.com`
  cy.setDevClaimsEmail(email)
  cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
    request.headers['X-Dekart-Claim-Email'] = email
  })
  cy.visit('/')
  cy.ensureTestWorkspace()
  cy.get('#dekart-create-report').click()
  cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
  cy.enterQuery(SIX_ROW_QUERY)
  cy.get('#dekart-query-execute-button').should('be.enabled').click()
  cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
  cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).then(button => {
    if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
  })
  cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '6')
}

function addNativeFilter (field, setValue) {
  cy.get('[data-testid="filter-strip"]').contains('button', 'Add filter').click()
  cy.get('.field-selector .item-selector').last().click()
  cy.contains('.field-selector_list-item', field).click()
  setValue()
  cy.get('[data-testid="widgets-tab"]').click()
}

// Holding the first run exposes the window where the dataset is republished.
function executeHoldingFirstRun (query) {
  let delayNextRun = true
  cy.intercept('POST', '**/Dekart/RunQuery', request => {
    if (delayNextRun) {
      delayNextRun = false
      return Cypress.Promise.delay(3000).then(() => request.continue())
    }
    request.continue()
  })
  if (query) cy.enterQuery(query)
  cy.get('#dekart-query-execute-button').should('be.enabled').click()
  cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
  cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')
}

// A filter is authored state: re-running the query republishes the dataset, and
// the filter must still apply to the new rows.
describe('native filter across data reload', () => {
  beforeEach(() => createReportWithSixRows())

  it('keeps a native range filter when the query is re-executed', () => {
    addNativeFilter('latitude', () => cy.get('.kg-range-slider__input').last().clear().type('52.52{enter}'))
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'latitude')

    executeHoldingFirstRun()

    cy.get('[data-testid="filter-strip"]', { timeout: 30000 }).should('contain.text', 'latitude')
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
  })

  it('keeps a native category filter when the query is re-executed', () => {
    addNativeFilter('category', () => {
      cy.get('.filter-panel .item-selector').eq(1).click()
      cy.contains('.list__item', 'Alpha').click()
    })
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')

    executeHoldingFirstRun()

    cy.get('[data-testid="filter-strip"]', { timeout: 30000 }).should('contain.text', 'category')
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
  })

  it('keeps a widget category selection when the query is re-executed', () => {
    cy.get(CATEGORY_BAR, { timeout: 30000 }).first().click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'category')

    executeHoldingFirstRun()

    cy.get('[data-testid="filter-strip"]', { timeout: 30000 }).should('contain.text', 'category')
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
  })

  it('keeps a native filter when an edited query returns a different result', () => {
    addNativeFilter('latitude', () => cy.get('.kg-range-slider__input').last().clear().type('52.52{enter}'))
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')

    executeHoldingFirstRun(NINE_ROW_QUERY)

    cy.get('[data-testid="filter-strip"]', { timeout: 30000 }).should('contain.text', 'latitude')
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
  })
})
