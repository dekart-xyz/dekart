// Regression: A held rerun publishes the previous report filter after navigation.
/* global cy, describe, it, Cypress */

const QUERY = "SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)"

// Navigation must cancel an old publication before a new report can receive its recovery.
describe('filter recovery across report navigation', () => {
  it('rejects a held rerun after closing the report and opening a new one', { defaultCommandTimeout: 30000 }, () => {
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

    let held = false
    let appWindow
    let oldPath
    let release
    const gate = new Cypress.Promise(resolve => { release = resolve })
    cy.window().then(win => { appWindow = win; oldPath = win.location.pathname })
    cy.intercept('POST', '**/Dekart/RunDuckDBQuery', request => {
      if (!held) {
        held = true
        request.alias = 'heldRerun'
        // Cypress waits for the held request, so use the app's DOM to open the next report.
        appWindow.setTimeout(() => {
          appWindow.history.pushState({}, '', '/')
          appWindow.dispatchEvent(new appWindow.PopStateEvent('popstate'))
          const waitForHome = appWindow.setInterval(() => {
            const create = appWindow.document.querySelector('#dekart-create-report')
            if (!create) return
            appWindow.clearInterval(waitForHome)
            create.click()
            const waitForDuckDB = appWindow.setInterval(() => {
              const duckDB = [...appWindow.document.querySelectorAll('button')].find(button => button.textContent.includes('DuckDB'))
              if (!duckDB) return
              appWindow.clearInterval(waitForDuckDB)
              duckDB.click()
              const waitForReport = appWindow.setInterval(() => {
                if (appWindow.location.pathname === oldPath || !appWindow.document.querySelector('#dekart-query-execute-button')) return
                appWindow.clearInterval(waitForReport)
                release()
              }, 50)
            }, 50)
          }, 50)
        }, 1000)
        return gate.then(() => request.continue())
      }
      request.continue()
    })
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.wrap(null).should(() => { if (!held) throw new Error('Waiting for held rerun') })
    cy.location('pathname').should('not.eq', oldPath).and('not.eq', '/')
    cy.get('#dekart-query-execute-button', { timeout: 30000 }).should('exist')
    cy.wait('@heldRerun')
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
