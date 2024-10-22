/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('cloud basic flow', () => {
  it('with info token', () => {
    cy.visit('/playground')
    cy.get('button:contains("Playground Mode")').should('be.visible')

    // create new report
    cy.get(`button:contains("${copy.create_report}")`).click()

    // run query
    cy.get('textarea').type(copy.simple_sql_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')
    cy.get(`span:contains("${copy.downloading}")`).should('contain', 'kB') // size of result shown

    // switch to private workspace
    cy.get('button#dekart-playground-mode-button').click()
    cy.get('button:contains("Switch to private workspace")').click()

    cy.get('button:contains("Create workspace")').should('be.visible')

    // create workspace
    cy.visit('/')
    cy.get('button:contains("Create workspace")').click()
    cy.get('input#name').type('test')
    cy.get('button:contains("Create")').click()
    cy.get('button:contains("BigQuery")').click()
    cy.get('button:contains("Continue to Google")').should('be.visible')
  })
})
