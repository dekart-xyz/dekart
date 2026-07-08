/* eslint-disable no-undef */

describe('cloud connection selector overflow', () => {
  beforeEach(() => {
    cy.resetCloudTestDatabase()
    cy.setDevClaimsEmail(`more-warehouses-${Date.now()}@example.com`)
    cy.visit('/')
    cy.ensureTestWorkspace()
  })

  it('opens the overflow connector catalog from More warehouses', () => {
    cy.visit('/connections')
    cy.get('#dekart-connection-type-card-postgres', { timeout: 30000 }).should('be.visible')
    cy.get('#dekart-connection-type-card-other').should('not.exist')
    cy.get('#dekart-more-warehouses', { timeout: 20000 })
      .scrollIntoView()
      .should('be.visible')
      .and('contain', 'More warehouses')
      .and('contain', 'Databricks, Redshift, DuckDB & more')
      .click()
    cy.get('div.ant-modal-title', { timeout: 20000 }).should('contain', 'Which database do you use?')
  })
})
