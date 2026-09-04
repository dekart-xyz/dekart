/* eslint-disable no-undef */

describe('self-hosted additional workspace creation', () => {
  it('lets the configured admin create and switch to another workspace', () => {
    const workspaceName = `Germany ${Date.now()}`
    let originalWorkspaceName

    cy.setDevClaimsEmail('workspace-admin@example.com')
    cy.visit('/workspace')

    cy.get('.ant-select-selection-item', { timeout: 30000 }).invoke('text').then((name) => {
      originalWorkspaceName = name.trim()
    })
    cy.get('.ant-select', { timeout: 30000 }).first().click()
    cy.contains('span', 'Create Workspace').click()
    cy.location('pathname').should('eq', '/workspace/create')

    cy.contains('label', 'Workspace Name')
      .parents('.ant-form-item')
      .find('input')
      .clear()
      .type(workspaceName)
    cy.contains('button', 'Create Workspace').click()

    cy.location('pathname', { timeout: 30000 }).should('eq', '/')
    cy.get('.ant-select-selection-item', { timeout: 30000 }).should('contain', workspaceName)

    cy.get('.ant-select').first().click()
    cy.then(() => {
      cy.contains('.ant-select-item-option', originalWorkspaceName).should('be.visible')
    })
    cy.contains('.ant-select-item-option', workspaceName).should('be.visible')
  })
})
