/* global cy, describe, it, Cypress */

// A native Kepler filter is authored state. Re-running the query republishes the
// dataset, and the filter must still apply to the new rows.
describe('native filter across data reload', () => {
  it('keeps a native category filter when the query is re-executed', () => {
    const email = `kepler-filter-reload-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
    cy.enterQuery("SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)")
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).then(button => {
      if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
    })
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '6')

    // Author a native Kepler range filter that keeps the first three rows.
    cy.get('[data-testid="filter-strip"]').contains('button', 'Add filter').click()
    cy.get('.field-selector .item-selector').last().click()
    cy.contains('.field-selector_list-item', 'latitude').click()
    cy.get('.kg-range-slider__input').last().clear().type('52.52{enter}')
    cy.get('[data-testid="widgets-tab"]').click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'latitude')

    // Re-run the same query. Holding the request exposes the window where the
    // dataset is republished, which is when an unprotected filter is lost.
    let delayNextRun = true
    cy.intercept('POST', '**/Dekart/RunQuery', request => {
      if (delayNextRun) {
        delayNextRun = false
        return Cypress.Promise.delay(3000).then(() => request.continue())
      }
      request.continue()
    })
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')

    cy.get('[data-testid="filter-strip"]', { timeout: 30000 }).should('contain.text', 'latitude')
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
  })

  it('keeps a native category filter when the query is re-executed', () => {
    const email = `kepler-category-reload-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
    cy.enterQuery("SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)")
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).then(button => {
      if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
    })
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '6')

    // A categorical filter carries a value that only exists in the field's domain.
    cy.get('[data-testid="filter-strip"]').contains('button', 'Add filter').click()
    cy.get('.field-selector .item-selector').last().click()
    cy.contains('.field-selector_list-item', 'category').click()
    cy.get('.filter-panel .item-selector').eq(1).click()
    cy.contains('.list__item', 'Alpha').click()
    cy.get('[data-testid="widgets-tab"]').click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')

    let delayNextRun = true
    cy.intercept('POST', '**/Dekart/RunQuery', request => {
      if (delayNextRun) {
        delayNextRun = false
        return Cypress.Promise.delay(3000).then(() => request.continue())
      }
      request.continue()
    })
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')

    cy.get('[data-testid="filter-strip"]', { timeout: 30000 }).should('contain.text', 'category')
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
  })

  it('keeps a widget category selection when the query is re-executed', () => {
    const email = `widget-selection-reload-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
    cy.enterQuery("SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)")
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).then(button => {
      if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
    })
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '6')

    // A chart selection is a widget-owned Kepler filter and must survive the same reload.
    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line', { timeout: 30000 }).first().click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'category')

    let delayNextRun = true
    cy.intercept('POST', '**/Dekart/RunQuery', request => {
      if (delayNextRun) {
        delayNextRun = false
        return Cypress.Promise.delay(3000).then(() => request.continue())
      }
      request.continue()
    })
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')

    cy.get('[data-testid="filter-strip"]', { timeout: 30000 }).should('contain.text', 'category')
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
  })

  it('keeps a native filter when an edited query returns a different result', () => {
    const email = `kepler-filter-edit-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
    cy.enterQuery("SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)")
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).then(button => {
      if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
    })
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '6')

    cy.get('[data-testid="filter-strip"]').contains('button', 'Add filter').click()
    cy.get('.field-selector .item-selector').last().click()
    cy.contains('.field-selector_list-item', 'latitude').click()
    cy.get('.kg-range-slider__input').last().clear().type('52.52{enter}')
    cy.get('[data-testid="widgets-tab"]').click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')

    // Editing the SQL publishes a different result for the same dataset.
    cy.enterQuery("SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(9) t(i)")
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')

    cy.get('[data-testid="filter-strip"]', { timeout: 30000 }).should('contain.text', 'latitude')
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
  })
})
