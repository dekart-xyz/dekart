/* eslint-disable no-undef */

describe('cloud login flow regression', () => {
  it('uses auth redirect for anonymous public report login', () => {
    // create workspace
    cy.visit('/')
    cy.get('button:contains("Create Workspace")', { timeout: 20000 }).click()
    cy.get('input#name').type(`test-login-regression-${Math.floor(Math.random() * 1000000)}`)
    cy.get('button:contains("Create")').click()

    // create new report from uploaded file
    cy.get('button#dekart-create-report', { timeout: 10000 }).click()
    cy.get('button:contains("Upload File")').click()
    cy.get('input[type="file"]').selectFile('cypress/fixtures/sample.csv', { force: true })
    cy.get('button:contains("Upload")').click()
    cy.get('div:contains("8,276 rows")', { timeout: 20000 }).should('be.visible')

    // make report public
    cy.get('button#dekart-share-report').click()
    cy.get('button#dekart-publish-report').click()
    cy.get('button#dekart-publish-report')
      .should('have.class', 'ant-switch-checked')
      .and('not.have.class', 'ant-switch-loading')

    // remember report URL, clear local auth state, reopen as anonymous viewer
    cy.location('pathname').then((reportPath) => {
      cy.clearLocalStorage()
      cy.window().then((win) => {
        win.sessionStorage.clear()
      })
      cy.visit(reportPath)
    })

    cy.get('#dekart-login-button').should('be.visible').and('contain', 'Login with Google')
    cy.contains('button', 'Create Map').should('not.exist')
    cy.contains('Login requires SSO').should('not.exist')

    // regression guard: cloud login must hit auth endpoint, not show OSS popup
    cy.intercept('GET', '**/api/v1/authenticate*').as('authenticate')
    cy.get('#dekart-login-button').click()
    cy.wait('@authenticate')
  })
})
