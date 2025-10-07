/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('archive and unarchive report', () => {
  it('should archive and restore a report', () => {
    const reportName = `Test Report ${Math.floor(Math.random() * 1000000)}`

    cy.visit('/')

    // Create new report
    cy.get('button#dekart-create-report').click()

    // Set report title - click on title to activate edit mode, then type
    cy.get('span').contains('Untitled').click()
    cy.get('input#dekart-report-title-input').should('be.visible')
    cy.get('input#dekart-report-title-input').clear()
    cy.get('input#dekart-report-title-input').type(reportName)
    cy.get('input#dekart-report-title-input').type('{enter}')

    cy.get('span').contains(reportName).should('be.visible')
    cy.wait(1000)

    // Run a simple query to make the report valid
    cy.get('button:contains("Run SQL")').click()
    cy.get('textarea').type(copy.simple_sql_query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')

    // // Go back to home page
    cy.visit('/')

    // Archive the report (force click since button is only visible on hover)
    // Find the row containing the report name, then find the archive button in that row
    cy.contains('tr', reportName).should('be.visible')
    cy.contains('tr', reportName).find('button#dekart-archive-report').click({ force: true })

    // Verify report is no longer in the main list
    cy.get('td').contains(reportName).should('not.exist')

    // Switch to archived view
    cy.get('#dekart-archived-switch').click()

    // Verify report appears in archived list
    cy.get('td').contains(reportName).should('be.visible')

    // Restore the report (force click since button is only visible on hover)
    cy.contains('tr', reportName).find('button#dekart-restore-report').click({ force: true })

    // Wait for switch to automatically turn off (happens when last archived report is restored)
    cy.get('#dekart-archived-switch').should('not.have.class', 'ant-switch-checked')

    // Verify report is back in the main list
    cy.get('td').contains(reportName).should('be.visible')
  })
})
