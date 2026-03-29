/* eslint-disable no-undef */

describe('cloud basic flow', () => {
  it('with info token', () => {
    cy.visit('/')
    cy.get('body', { timeout: 20000 }).should(($body) => {
      const hasCreateWorkspace = [...$body.find('button')].some((button) => button.innerText.includes('Create Workspace'))
      const hasCreateReport = $body.find('button#dekart-create-report').length > 0
      expect(hasCreateWorkspace || hasCreateReport).to.equal(true)
    })
    cy.get('body').then(($body) => {
      const hasCreateWorkspace = [...$body.find('button')].some((button) => button.innerText.includes('Create Workspace'))
      if (hasCreateWorkspace) {
        cy.contains('button', 'Create Workspace').click()
        cy.get('input#name').type(`test-${Math.floor(Math.random() * 1000000)}`)
        cy.get('button:contains("Create")').click()
      }
    })

    // create new report
    cy.visit('/')
    cy.get('button#dekart-create-report', { timeout: 20000 }).click()
    cy.get('button:contains("Upload File")').click()
    cy.get('input[type="file"]').selectFile('cypress/fixtures/sample.csv', { force: true })
    cy.get('button:contains("Upload")').click()
    cy.get('div:contains("8,276 rows")', { timeout: 20000 }).should('be.visible')

    cy.get('button#dekart-share-report').click()
    cy.get('button#dekart-publish-report').then(($button) => {
      if (!$button.hasClass('ant-switch-checked')) {
        cy.wrap($button).click()
      }
    })
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

  it('anonymous public report login uses auth redirect', () => {
    cy.visit('/')
    cy.get('body', { timeout: 20000 }).should(($body) => {
      const hasCreateWorkspace = [...$body.find('button')].some((button) => button.innerText.includes('Create Workspace'))
      const hasCreateReport = $body.find('button#dekart-create-report').length > 0
      expect(hasCreateWorkspace || hasCreateReport).to.equal(true)
    })
    cy.get('body').then(($body) => {
      const hasCreateWorkspace = [...$body.find('button')].some((button) => button.innerText.includes('Create Workspace'))
      if (hasCreateWorkspace) {
        cy.contains('button', 'Create Workspace').click()
        cy.get('input#name').type(`test-login-regression-${Math.floor(Math.random() * 1000000)}`)
        cy.get('button:contains("Create")').click()
      }
    })

    cy.visit('/')
    cy.get('button#dekart-create-report', { timeout: 20000 }).click()
    cy.get('button:contains("Upload File")').click()
    cy.get('input[type="file"]').selectFile('cypress/fixtures/sample.csv', { force: true })
    cy.get('button:contains("Upload")').click()
    cy.get('div:contains("8,276 rows")', { timeout: 20000 }).should('be.visible')

    cy.get('button#dekart-share-report').click()
    cy.get('button#dekart-publish-report').click()
    cy.get('button#dekart-publish-report')
      .should('have.class', 'ant-switch-checked')
      .and('not.have.class', 'ant-switch-loading')

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

    cy.intercept('GET', '**/api/v1/authenticate*').as('authenticate')
    cy.get('#dekart-login-button').click()
    cy.wait('@authenticate')
  })
})
