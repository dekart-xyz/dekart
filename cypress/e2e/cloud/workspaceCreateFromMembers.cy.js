// Regression: Create Workspace renders an empty members form for a user without a workspace.
/* eslint-disable no-undef */

describe('Workspace creation from the welcome screen', () => {
  const email = `workspace-route-${Date.now()}@example.com`

  beforeEach(() => {
    cy.setDevClaimsEmail(email)
  })

  it('opens the creation form from /workspace', () => {
    cy.visit('/workspace')
    cy.contains('Start Mapping in Seconds').should('be.visible')
    cy.get('#dekart-create-workspace').click()
    cy.get('input[placeholder="Workspace name"]').should('be.visible')
  })

  it('opens the creation form from /workspace/members', () => {
    cy.visit('/workspace/members')
    cy.contains('Start Mapping in Seconds').should('be.visible')
    cy.get('#dekart-create-workspace').click()
    cy.get('input[placeholder="Workspace name"]').should('be.visible')
  })
})
