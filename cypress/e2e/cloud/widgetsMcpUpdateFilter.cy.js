/* global cy, describe, expect, it, Cypress */

const apiBase = `${Cypress.env('DEKART_E2E_API_URL')}/api/v1`
const categoryBar = '[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line'

function authorizeDevice () {
  return cy.request('POST', `${apiBase}/device`, { device_name: 'cypress-widgets-mcp-update' }).then((startResponse) => {
    expect(startResponse.status, 'device start status').to.eq(200)
    expect(startResponse.body.auth_url, 'device authorization URL').to.include('/device/authorize')
    const deviceId = startResponse.body.device_id

    cy.visit(startResponse.body.auth_url)
    cy.contains('button', 'Authorize', { timeout: 30000 }).click()
    cy.contains('Device authorized', { timeout: 30000 }).should('be.visible')

    return cy.request('POST', `${apiBase}/device/token`, { device_id: deviceId }).then((tokenResponse) => {
      expect(tokenResponse.body.status, 'device token status').to.eq('authorized')
      expect(tokenResponse.body.token, 'device token').to.be.a('string')
      expect(tokenResponse.body.token, 'device token').not.to.eq('')
      return tokenResponse.body.token
    })
  })
}

function callMCP (token, name, args = {}) {
  return cy.request({
    method: 'POST',
    url: `${apiBase}/mcp/call`,
    headers: { Authorization: `Bearer ${token}` },
    body: { name, arguments: args },
    failOnStatusCode: false
  }).then((response) => {
    expect(response.status, `${name} status: ${JSON.stringify(response.body)}`).to.eq(200)
    expect(response.body, `${name} result`).to.have.property('result')
    return response.body.result
  })
}

function appendNumberWidget (token, reportId) {
  return callMCP(token, 'get_report_properties', { report_id: reportId }).then((properties) => {
    const raw = properties.report.widgets_config || properties.report.widgetsConfig
    const config = JSON.parse(raw)
    const dataId = config.widgets[0].dataId
    config.widgets.push({
      id: 'mcp-row-count',
      dataId,
      type: 'number',
      title: 'MCP row count',
      settings: { operation: 'count' }
    })
    return callMCP(token, 'update_report_widgets_config', {
      report_id: reportId,
      widgets_config: JSON.stringify(config)
    })
  })
}

describe('MCP widget updates preserve chart filtering', () => {
  it('keeps chart selections in Kepler after MCP appends a widget', () => {
    const email = `widgets-mcp-update-${Date.now()}@example.com`
    cy.viewport(1280, 960)
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()

    authorizeDevice().then((token) => {
      cy.visit('/')
      cy.get('#dekart-create-report').click()
      cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
      cy.enterQuery("SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE i % 2 WHEN 0 THEN 'Alpha' ELSE 'Beta' END AS category, i * 10 AS amount FROM range(6) t(i)")
      cy.get('#dekart-query-execute-button').should('be.enabled').click()
      cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
      cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '6')
      cy.get('[data-testid="category-chart"]', { timeout: 120000 }).should('contain.text', 'Alpha').and('contain.text', 'Beta')

      cy.intercept('POST', '**/Dekart/UpdateReport').as('saveInitialCharts')
      cy.get('#dekart-save-button').click()
      cy.wait('@saveInitialCharts', { timeout: 30000 })

      cy.location('pathname').then((pathname) => {
        const reportId = pathname.split('/')[2]
        expect(reportId, 'report ID').to.be.a('string')
        expect(reportId, 'report ID').not.to.eq('')
        appendNumberWidget(token, reportId)
      })

      cy.contains('MCP row count', { timeout: 30000 }).should('be.visible')
      cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.length', 2).should(values => {
        expect([...values].map(value => value.textContent)).to.deep.eq(['6', '6'])
      })
      cy.get(categoryBar, { timeout: 30000 }).first().click()
      cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.length', 2).should(values => {
        expect([...values].map(value => value.textContent)).to.deep.eq(['3', '3'])
      })
      // The local Mosaic selection updates both metrics, but the selection must also become canonical Kepler state.
      cy.get('[data-testid="filter-strip"]', { timeout: 30000 }).should('contain.text', 'category')

      cy.wait(2500)
      cy.reload()
      cy.get('[data-testid="filter-strip"]', { timeout: 120000 }).should('contain.text', 'category')
      cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.length', 2).should(values => {
        expect([...values].map(value => value.textContent)).to.deep.eq(['3', '3'])
      })
    })
  })
})
