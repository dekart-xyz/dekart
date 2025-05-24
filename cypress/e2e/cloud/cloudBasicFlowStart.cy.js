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

    // create new report
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.get('button:contains("Upload File")').click()
    cy.get('input[type="file"]').selectFile('cypress/fixtures/sample.csv', { force: true })
    cy.get('button:contains("Upload")').click()
    cy.get('div:contains("8,276 rows")', { timeout: 20000 }).should('be.visible')

    cy.get('button#dekart-share-report').click()
    cy.get('button#dekart-publish-report').click()
    cy.get('button#dekart-publish-report')
      .should('have.class', 'ant-switch-checked')
      .and('not.have.class', 'ant-switch-loading')

    cy.reload(true)
    cy.get('div:contains("8,276 rows")', { timeout: 20000 }).should('be.visible')
    cy.get('button#dekart-share-report').click()
    cy.get('button#dekart-publish-report').click()
    cy.get('button#dekart-publish-report')
      .should('not.have.class', 'ant-switch-checked')
      .and('not.have.class', 'ant-switch-loading')
    cy.reload(true)
    cy.get('div:contains("8,276 rows")', { timeout: 20000 }).should('be.visible')

    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    // click #dekart-add-connection
    cy.get('#dekart-add-connection').click()

    // create connection
    cy.get('button:contains("BigQuery")').click()
    cy.get('button:contains("Connect with Google")').click()
    cy.get('button:contains("Continue to Google")').should('be.visible')
  })
})
