/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('cloud basic flow', () => {
  it('with info token', () => {
    cy.visit('/playground')
    cy.get('#dekart-create-report').should('be.visible')
    cy.get('#dekart-main-menu').click()
    cy.get('span:contains("Playground Workspace")').should('be.visible')

    // create new report
    cy.get('#dekart-create-report').click()

    // run query
    cy.get('textarea').type(copy.simple_sql_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')
    cy.get(`span:contains("${copy.downloading}")`).should('contain', 'kB') // size of result shown

    // switch to private workspace
    cy.get('#dekart-avatar').click()
    cy.get('span:contains("Switch to workspace")').click()

    cy.get('button:contains("Create Workspace")').should('be.visible')

    // create workspace
    cy.visit('/')
    cy.get('button:contains("Create Workspace")').click()
    cy.get('input#name').type('test')
    cy.get('button:contains("Create")').click()
    cy.get('button:contains("BigQuery")').click()
    cy.get('button:contains("Connect with Google")').click()
    cy.get('button:contains("Continue to Google")').should('be.visible')
  })
})
