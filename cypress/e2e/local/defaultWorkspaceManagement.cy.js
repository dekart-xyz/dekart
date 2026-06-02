/* eslint-disable no-undef */

describe('self-hosted default workspace management', () => {
  it('manages the default workspace without enabling workspace creation', () => {
    const workspaceName = `Default Local ${Date.now()}`
    const setInputValue = (selector, value) => {
      cy.get(selector).then(($input) => {
        const el = $input[0]
        const valueSetter = Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView.HTMLInputElement.prototype, 'value').set
        valueSetter.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        el.dispatchEvent(new Event('blur', { bubbles: true }))
      })
    }

    cy.visit('http://localhost:3000/workspace')

    cy.contains('label', 'Workspace name', { timeout: 30000 })
      .parents('.ant-form-item')
      .find('input')
      .as('workspaceNameInput')
      .should('have.value', 'Default')
    cy.contains('button', 'Create Workspace').should('not.exist')

    setInputValue('@workspaceNameInput', workspaceName)
    cy.contains('button', 'Update').click()
    cy.contains('Workspace updated', { timeout: 30000 }).should('be.visible')

    cy.reload()
    cy.contains('label', 'Workspace name', { timeout: 30000 })
      .parents('.ant-form-item')
      .find('input')
      .should('have.value', workspaceName)

    cy.get('.ant-select', { timeout: 30000 }).first().click()
    cy.contains('span', 'Manage Workspace', { timeout: 30000 }).click()
    cy.location('pathname', { timeout: 30000 }).should('eq', '/workspace')

    cy.contains('label', 'Workspace ID')
      .parents('.ant-form-item')
      .find('input')
      .should('have.value', '00000000-0000-0000-0000-000000000000')

    cy.contains('span', 'Members').click()
    cy.contains('button', 'Invite user').should('not.exist')
    cy.contains('button', 'Remove').should('not.exist')
    cy.contains('UNKNOWN_EMAIL', { timeout: 30000 }).should('be.visible')
    cy.contains('Admin').should('be.visible')

    cy.contains('span', 'Tokens').click()
    cy.contains('No active device tokens', { timeout: 30000 }).should('be.visible')
  })
})
