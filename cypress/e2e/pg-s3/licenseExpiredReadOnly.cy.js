/* eslint-disable no-undef */

describe('pg-s3 expired license read-only', () => {
  it('shows license expiry and blocks writes with the dev startup bypass', () => {
    const appUrl = Cypress.env('DEKART_E2E_BASE_URL') || 'http://localhost:3000'
    const apiBase = `${appUrl}/api/v1`

    cy.visit(appUrl)

    cy.contains('License key expired', { timeout: 30000 }).should('be.visible')
    cy.contains('a', 'Extend Key')
      .should('have.attr', 'href', 'https://calendly.com/vladi-dekart/30min')

    cy.get('#dekart-create-report', { timeout: 30000 })
      .should('be.visible')
      .and('be.disabled')
      .and('have.attr', 'title', 'Workspace is read-only')

    cy.request({
      method: 'POST',
      url: `${apiBase}/mcp/call`,
      body: { name: 'create_report', arguments: {} },
      failOnStatusCode: false
    }).then((response) => {
      expect(response.status).to.eq(403)
      const errorText = typeof response.body === 'string' ? response.body : response.text
      expect(errorText).to.contain('license key expired')
    })
  })
})
