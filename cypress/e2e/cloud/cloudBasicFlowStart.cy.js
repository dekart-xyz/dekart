// Critical path: Cloud sign-up to first map, including the BigQuery grant-access screen
/* eslint-disable no-undef */

describe('cloud basic flow', () => {
  before(() => {
    cy.resetCloudTestDatabase()
  })

  it('with info token', () => {
    cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN_INFO')

    // create workspace
    cy.visit('/')
    cy.get('button#dekart-create-workspace').click()
    cy.get('input#name').type('test')
    cy.get('#source').click()
    cy.get('.ant-select-item-option').contains('Google Search').click()
    cy.get('button:contains("Create")').click()
    cy.get('button#dekart-start-trial', { timeout: 30000 }).click()

    // create new report
    cy.get('button#dekart-create-report').click()
    cy.get('button:contains("Upload File")').click()
    cy.get('input[type="file"]').selectFile('cypress/fixtures/sample.csv', { force: true })
    cy.get('button:contains("Upload")').click()
    cy.get('div:contains("8,276 rows")', { timeout: 60000 }).should('be.visible')

    cy.get('button#dekart-share-report').click()
    cy.get('button#dekart-publish-report').click()
    cy.get('button#dekart-publish-report', { timeout: 60000 })
      .should('have.class', 'ant-switch-checked')
      .and('not.have.class', 'ant-switch-loading')

    cy.location('pathname').then((pathname) => {
      cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN_INFO', pathname)
    })
    cy.reload(true)
    cy.get('div:contains("8,276 rows")', { timeout: 20000 }).should('be.visible')
    cy.get('button#dekart-share-report').click()
    cy.get('button#dekart-publish-report').click()
    cy.get('button#dekart-publish-report', { timeout: 60000 })
      .should('not.have.class', 'ant-switch-checked')
      .and('not.have.class', 'ant-switch-loading')
    cy.location('pathname').then((pathname) => {
      cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN_INFO', pathname)
    })
    cy.reload(true)
    cy.get('div:contains("8,276 rows")', { timeout: 20000 }).should('be.visible')

    cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN_INFO', '/')
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    // click #dekart-add-connection
    cy.get('#dekart-add-connection').click()

    // create connection
    cy.get('button:contains("BigQuery")').click()
    cy.location('pathname').then((pathname) => {
      cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN_INFO', pathname)
    })
    cy.get('button:contains("Connect with Google")').click()
    cy.get('button:contains("Continue to Google")').should('be.visible')
  })

  it('loads public report data anonymously and requires login when tracking viewers', () => {
    cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN_INFO')
    cy.visit('/')
    // Login returns before the workspace's report and connection streams finish loading.
    cy.get('button#dekart-create-report', { timeout: 30000 }).should('be.visible').click()
    cy.get('button:contains("Upload File")').click()
    cy.get('input[type="file"]').selectFile('cypress/fixtures/sample.csv', { force: true })
    cy.get('button:contains("Upload")').click()
    cy.get('div:contains("8,276 rows")', { timeout: 60000 }).should('be.visible')

    cy.get('button#dekart-share-report').click()
    cy.get('button#dekart-publish-report').click()
    cy.get('button#dekart-publish-report', { timeout: 60000 })
      .should('have.class', 'ant-switch-checked')
      .and('not.have.class', 'ant-switch-loading')

    cy.location('pathname').then((reportPath) => {
      cy.clearLocalStorage()
      cy.window().then((win) => {
        win.sessionStorage.clear()
      })
      cy.visit(reportPath)
    })

    cy.get('div:contains("8,276 rows")', { timeout: 60000 }).should('be.visible')
    cy.assertDatasetTable('sample.csv', ['primary_type', 'district'], ['THEFT'])
    cy.get('#dekart-login-button').should('be.visible').and('contain', 'Login with Google')
    cy.contains('button', 'Create Map').should('not.exist')
    cy.contains('Login requires SSO').should('not.exist')

    cy.location('pathname').then((pathname) => {
      cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN_INFO', pathname)
    })
    cy.get('#dekart-login-button').click()
    cy.wait('@authenticate')
    cy.get('button#dekart-share-report', { timeout: 30000 }).click()
    cy.get('button#dekart-track-viewers').click()
    cy.get('button#dekart-track-viewers', { timeout: 30000 })
      .should('have.class', 'ant-switch-checked')
      .and('not.have.class', 'ant-switch-loading')

    cy.location('pathname').then((reportPath) => {
      cy.clearLocalStorage()
      cy.window().then((win) => {
        win.sessionStorage.clear()
      })
      // Stop at the login page so the OAuth helper cannot sign the viewer back in.
      cy.intercept('GET', '**/api/v1/authenticate*', {
        statusCode: 200,
        body: 'Login required for this report'
      }).as('trackedReportLogin')
      cy.visit(reportPath)
    })
    cy.wait('@trackedReportLogin')
    cy.contains('Login required for this report').should('be.visible')
    cy.get('.source-data-title').should('not.exist')
  })
})
