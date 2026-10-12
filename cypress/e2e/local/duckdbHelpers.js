/* eslint-disable no-undef */

export const LAYER_SELECTOR = '[data-testid="sortable-layer-item"], [data-testid="static-layer-item"]'

// createReport opens a new empty report through the available local entry point.
export function createReport () {
  cy.visit('/')
  cy.get('body', { timeout: 20000 }).then(($body) => {
    if ($body.text().includes('Ready to connect')) {
      cy.contains('button', 'Use file upload').click()
    } else {
      cy.get('button#dekart-create-report', { timeout: 20000 }).click()
    }
  })
}

// uploadActiveDataset selects a fixture path or generated file for the active empty dataset and waits for storage.
export function uploadActiveDataset (fixture) {
  const [file, fileName] = typeof fixture === 'string'
    ? [`cypress/fixtures/${fixture}`, fixture]
    : [fixture, fixture.fileName]
  cy.contains('button', 'Upload File', { timeout: 20000 }).scrollIntoView().click({ force: true })
  cy.intercept('POST', '**/api/v1/file/*/upload-sessions/*/complete').as('completeUploadSession')
  cy.get('input[type="file"]', { timeout: 20000 }).selectFile(file, { force: true })
  cy.contains('button', 'Upload').click()
  cy.wait('@completeUploadSession', { timeout: 120000 })
  cy.contains('Ready', { timeout: 120000 }).should('be.visible')
  cy.contains(fileName, { timeout: 20000 }).should('be.visible')
}

// selectDuckDB chooses the browser-local query engine and verifies its supplied logo.
export function selectDuckDB () {
  cy.contains('button', 'DuckDB', { timeout: 20000 }).as('duckDBButton')
  cy.get('@duckDBButton').find('.anticon').should('have.css', 'background-image').and('include', 'Ebene_1')
  cy.get('@duckDBButton').scrollIntoView().click({ force: true })
}
