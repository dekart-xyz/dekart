/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('cloud basic flow', () => {
  it('should make simple bigquery query and get ready status', () => {
    // create workspace
    cy.visit('/')
    cy.get('button:contains("Create workspace")').click()
    cy.get('input#name').type('test')
    cy.get('button:contains("Create")').click()
    cy.get('button#dekart-1-choose-plan').click()
    cy.get('button:contains("Continue to Google")').should('be.visible')
  })
})
