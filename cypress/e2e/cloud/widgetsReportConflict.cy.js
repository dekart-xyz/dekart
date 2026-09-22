/* global cy, describe, expect, it, Cypress */

function createDuckDBReport (email, rowCount) {
  cy.setDevClaimsEmail(email)
  cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
    request.headers['X-Dekart-Claim-Email'] = email
  })
  cy.visit('/')
  cy.ensureTestWorkspace()
  cy.get('#dekart-create-report').click()
  cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
  cy.enterQuery(`SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(${rowCount}) t(i)`)
}

describe('Widget report save reconciliation', () => {
  it('does not treat its own new DuckDB query as a concurrent report edit', () => {
    const email = `widgets-report-conflict-${Date.now()}@example.com`
    createDuckDBReport(email, 5)
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
    cy.intercept('POST', '**/Dekart/CreateQuery').as('createQuery')
    cy.intercept('POST', '**/Dekart/UpdateReport', request => {
      if (saveHeld) return
      saveHeld = true
      request.continue(response => response.setDelay(2500))
    }).as('updateReport')

    cy.get('button[aria-label="Chart actions"]').first().click()
    cy.contains('[role="menuitem"]', 'Edit chart').click()
    cy.get('#widget-title').clear().type('Saved row count')
    cy.contains('button', 'Back to charts').click()
    cy.wrap(null).should(() => expect(saveHeld).to.equal(true))
    cy.get('.ant-tabs-nav-add:visible').last().click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
    cy.wait('@createQuery', { timeout: 30000 })
    cy.wait('@updateReport', { timeout: 30000 })
    cy.contains('This report changed in another session').should('not.exist')
    cy.contains('Map changed').should('not.exist')
    cy.contains('Saved row count').should('be.visible')

    cy.get('button[aria-label="Chart actions"]').first().click()
    cy.contains('[role="menuitem"]', 'Edit chart').click()
    cy.get('#widget-title').clear().type('Saved after query')
    cy.contains('button', 'Back to charts').click()
    cy.get('button#dekart-save-button').click()
    cy.get('button#dekart-save-button', { timeout: 30000 }).should('not.be.disabled')
    cy.reload()
    cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).click()
    cy.contains('Saved after query', { timeout: 120000 }).should('be.visible')
    cy.contains('This report changed in another session').should('not.exist')
  })

  it('keeps an unsaved report in edit mode after the connection fails', () => {
    const email = `widgets-report-offline-${Date.now()}@example.com`
    createDuckDBReport(email, 5)
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '5')
    cy.get('button#dekart-save-button').click()
    cy.get('button#dekart-save-button', { timeout: 30000 }).should('not.be.disabled')

    cy.intercept('POST', '**/Dekart/UpdateReport', request => {
      request.destroy()
    }).as('failedUpdateReport')
    cy.get('button[aria-label="Chart actions"]').first().click()
    cy.contains('[role="menuitem"]', 'Edit chart').click()
    cy.get('#widget-title').clear().type('Unsaved row count')
    cy.contains('button', 'Back to charts').click()
    cy.wait('@failedUpdateReport', { timeout: 30000 })

    cy.contains('.ant-select', 'Editing').click()
    cy.contains('.ant-select-item-option-content', 'Viewing').click()
    cy.location('pathname').should('match', /\/source$/)
    cy.contains('Unsaved row count').should('be.visible')

    cy.window().then(window => {
      window.history.pushState({}, '', window.location.pathname.replace(/\/source$/, ''))
      window.dispatchEvent(new window.PopStateEvent('popstate'))
    })
    cy.location('pathname').should('match', /\/source$/)
    cy.contains('Unsaved row count').should('be.visible')
  })
})
