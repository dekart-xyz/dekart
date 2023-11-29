// custom cypress commands
// see https://on.cypress.io/custom-commands
/* eslint-disable no-undef */

Cypress.Commands.add('subscribe', () => {
  cy.visit('/')
  cy.get('h1').should('contain', 'Subscription')
  cy.get('button:contains("Choose personal")').click()
})

Cypress.Commands.add('unsubscribe', () => {
  cy.visit('/subscription')
  cy.get('button:contains("Manage subscription")').click()
  cy.get('.ant-dropdown-menu-title-content:contains("Cancel subscription")').click()
  cy.get('button:contains("Yes")').click()
  cy.get('span:contains("Subscription canceled")').should('be.visible')
})
