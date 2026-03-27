/* eslint-disable no-undef */

describe('Version banner', () => {
  it('shows new release banner when forced old version is configured', () => {
    cy.visit('/')
    cy.contains(/New release .* available/i, { timeout: 20000 }).should('be.visible')
  })
})
