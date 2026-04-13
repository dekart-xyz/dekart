/* eslint-disable no-undef */

describe('bigquery large file upload', () => {
  it('uploads a 67MB CSV via upload-session API', () => {
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.get('button:contains("Upload File")').click()

    cy.intercept('POST', '**/api/v1/file/*/upload-sessions').as('startSession')
    cy.intercept('PUT', '**/api/v1/file/*/upload-sessions/*/parts/*').as('uploadPart')
    cy.intercept('POST', '**/api/v1/file/*/upload-sessions/*/complete').as('completeSession')
    cy.intercept('POST', '**/api/v1/file/*.csv').as('legacyUpload')

    cy.get('input[type="file"]').selectFile('cypress/fixtures/POI67Mb.csv', { force: true })
    cy.get('button:contains("Upload")').click()

    cy.wait('@startSession', { timeout: 60000 })
    cy.wait('@completeSession', { timeout: 300000 })
    cy.get('@uploadPart.all').should('have.length.at.least', 3)
    cy.get('@legacyUpload.all').should('have.length', 0)

    cy.contains('Ready (', { timeout: 300000 }).should('be.visible')
  })
})
