/* global cy, describe, it, Cypress, expect */

const apiBase = `${Cypress.env('DEKART_E2E_API_URL')}/api/v1`

// MCP writes use the same device authorization flow as other widget specs.
function authorizeDevice () {
  return cy.request('POST', `${apiBase}/device`, { device_name: 'cypress-widgets-search' }).then(start => {
    const deviceId = start.body.device_id
    cy.visit(start.body.auth_url)
    cy.contains('button', 'Authorize', { timeout: 30000 }).click()
    cy.contains('Device authorized', { timeout: 30000 }).should('be.visible')
    return cy.request('POST', `${apiBase}/device/token`, { device_id: deviceId }).then(response => response.body.token)
  })
}

function callMCP (token, name, args = {}) {
  return cy.request({
    method: 'POST',
    url: `${apiBase}/mcp/call`,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: { name, arguments: args }
  }).then(response => response.body.result)
}

describe('Search widget', () => {
  it('filters by searched values and restores the selection', () => {
    cy.viewport(1280, 960)
    const email = `widgets-search-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
    cy.enterQuery("SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, i * 10 AS amount, CASE i WHEN 0 THEN 'Alpha%' WHEN 1 THEN 'Beta_test' ELSE 'O''Brien' END AS locker_name FROM range(3) t(i)")
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).click()
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '3')

    cy.contains('button', 'Add chart').click()
    cy.contains('button', /^Search/).click()
    cy.get('button[role="combobox"]').last().click()
    cy.contains('[role="option"]', 'amount').should('not.exist')
    cy.contains('[role="option"]', 'locker_name').click()
    cy.contains('button', /^Create$/).click()
    cy.get('[data-testid="search-widget"]', { timeout: 30000 }).should('contain.text', 'Enter a value')
    cy.get('[data-testid="search-widget"]').closest('[data-testid="widget-item"]').should(item => {
      expect(item[0].getBoundingClientRect().height, 'compact Search card').to.be.within(80, 120)
    })

    cy.get('[data-testid="search-widget"] .item-selector').click()
    cy.get('.typeahead__input').last().type('Al%')
    cy.contains('.list__item', 'Alpha%').click()
    cy.get('[data-testid="number-value"]').should('have.text', '1')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'locker name')

    cy.get('[data-testid="search-widget"] .item-selector').click()
    cy.get('.typeahead__input').last().type('Brien')
    cy.contains('.list__item', "O'Brien").click()
    cy.get('[data-testid="number-value"]').should('have.text', '2')
    cy.get('[data-testid="search-widget"]').should('contain.text', 'Alpha%').and('contain.text', "O'Brien")

    cy.get('#dekart-save-button').click()
    cy.wait(2500)
    cy.reload()
    cy.get('[data-testid="search-widget"]', { timeout: 120000 }).should('contain.text', 'Alpha%').and('contain.text', "O'Brien")
    cy.get('[data-testid="number-value"]').should('have.text', '2')

    cy.get('button[aria-label="Remove locker name filter"]').click()
    cy.get('[data-testid="number-value"]').should('have.text', '3')
    cy.get('[data-testid="search-widget"] .item-selector').click()
    cy.get('.typeahead__input').last().type('Beta')
    cy.contains('.list__item', 'Beta_test').click()
    cy.get('[data-testid="number-value"]').should('have.text', '1')
    cy.get('[data-testid="search-widget"]').should('contain.text', 'Beta_test').and('not.contain.text', 'Alpha%')

    cy.contains('.ant-select', 'Editing').click()
    cy.contains('.ant-select-item-option-content', 'Viewing').click()
    cy.get('[data-testid="search-widget"]', { timeout: 120000 }).should('be.visible')
    cy.get('button[aria-label="Remove locker name filter"]').click()
    cy.get('[data-testid="search-widget"] .item-selector').click()
    cy.get('.typeahead__input').last().type('Alpha')
    cy.contains('.list__item', 'Alpha%').click()
    cy.get('[data-testid="number-value"]').should('have.text', '1')
    cy.contains('Map changed').should('not.exist')
  })

  it('finds a value among more than 10k dotted-name categories', () => {
    cy.viewport(1280, 960)
    const email = `widgets-search-many-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
    cy.enterQuery('SELECT 52.5 + (i % 100) / 1000 AS latitude, 13.4 + (i % 100) / 1000 AS longitude, \'All\' AS category, concat(\'Locker \', lpad(i::VARCHAR, 5, \'0\')) AS "locker.name" FROM range(10001) t(i)')
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).click()
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '10,001')
    cy.contains('button', 'Add chart').click()
    cy.contains('button', /^Search/).click()
    cy.get('button[role="combobox"]').last().click()
    cy.contains('[role="option"]', 'locker.name').click()
    cy.contains('button', /^Create$/).click()
    cy.get('[data-testid="search-widget"]', { timeout: 30000 }).should('contain.text', 'Enter a value')
    cy.get('[data-testid="search-widget"] .item-selector').click()
    cy.get('.typeahead__input').last().then(input => {
      const view = input[0].ownerDocument.defaultView
      view.searchTiming = { started: 0, elapsed: null }
      input[0].addEventListener('input', () => { view.searchTiming.started = view.performance.now() }, true)
      const observer = new view.MutationObserver(() => {
        const match = [...view.document.querySelectorAll('.list__item')].some(item => item.textContent.includes('Locker 10000'))
        if (match && view.searchTiming.elapsed === null) {
          view.searchTiming.elapsed = view.performance.now() - view.searchTiming.started
          observer.disconnect()
        }
      })
      observer.observe(view.document.body, { childList: true, subtree: true })
    })
    cy.get('.typeahead__input').last().type('Locker 10000')
    cy.contains('.list__item', 'Locker 10000').click()
    cy.window().its('searchTiming.elapsed').should('be.lessThan', 500)
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '1')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'locker.name')
  })

  it('accepts MCP creation and shows an error for a numeric Search field', () => {
    cy.viewport(1280, 960)
    const email = `widgets-search-mcp-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    authorizeDevice().then(token => {
      callMCP(null, 'get_widgets_config_schema').then(result => {
        expect(result.schema.$defs.searchWidget.allOf[1].properties.settings.required).to.deep.equal(['field'])
      })
      cy.visit('/')
      cy.get('#dekart-create-report').click()
      cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
      cy.enterQuery("SELECT 52.5 AS latitude, 13.4 AS longitude, 'Alpha' AS locker_name, 123 AS locker_id")
      cy.get('#dekart-query-execute-button').should('be.enabled').click()
      cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
      cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).click()
      cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '1')
      cy.get('#dekart-save-button').click()
      cy.location('pathname').then(pathname => {
        const reportId = pathname.split('/')[2]
        callMCP(token, 'get_report_properties', { report_id: reportId }).then(properties => {
          const config = JSON.parse(properties.report.widgets_config || properties.report.widgetsConfig)
          config.widgets.push({ id: 'mcp-search', dataId: config.widgets[0].dataId, type: 'search', title: 'Search locker', settings: { field: 'locker_id' } })
          callMCP(token, 'update_report_widgets_config', { report_id: reportId, widgets_config: JSON.stringify(config) })
        })
      })
      cy.reload()
      cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).click()
      cy.contains('[data-testid="widget-item"]', 'Search locker', { timeout: 120000 }).should('contain.text', "This chart couldn't load")
      cy.location('pathname').then(pathname => {
        const reportId = pathname.split('/')[2]
        callMCP(token, 'get_report_properties', { report_id: reportId }).then(properties => {
          const config = JSON.parse(properties.report.widgets_config || properties.report.widgetsConfig)
          config.widgets.find(widget => widget.id === 'mcp-search').settings.field = 'missing_column'
          callMCP(token, 'update_report_widgets_config', { report_id: reportId, widgets_config: JSON.stringify(config) })
        })
      })
      cy.reload()
      cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).click()
      cy.contains('[data-testid="widget-item"]', 'Search locker', { timeout: 120000 }).should('contain.text', "This chart couldn't load")
    })
  })
})
