/* eslint-disable no-undef */

describe('local GeoJSON file upload with extensionless dataset label', () => {
  it('loads a GeoJSON dataset after renaming the dataset label without a file extension', () => {
    const appUrl = Cypress.env('DEKART_E2E_BASE_URL') || 'http://localhost:3000'

    const getReportId = () => cy.location('pathname').should('match', /\/reports\/[^/]+\/source$/).then((pathname) => {
      return pathname.match(/\/reports\/([^/]+)\/source$/)[1]
    })

    const waitForNoDownloadMessage = () => {
      cy.get('body', { timeout: 120000 }).should(($body) => {
        expect($body.text(), 'download message').not.to.include('Downloading Map Data')
      })
    }

    cy.visit(`${appUrl}/`)
    cy.get('body', { timeout: 20000 }).then(($body) => {
      if ($body.text().includes('Ready to connect')) {
        cy.contains('button', 'Use file upload').click()
      } else {
        cy.get('button#dekart-create-report', { timeout: 20000 }).click()
      }
    })

    getReportId().then((reportId) => {
      cy.contains('button', 'Upload File', { timeout: 20000 }).click()
      cy.intercept('POST', '**/api/v1/file/*/upload-sessions').as('startSession')
      cy.intercept('PUT', '**/api/v1/file/*/upload-sessions/*/parts/*').as('uploadPart')
      cy.intercept('POST', '**/api/v1/file/*/upload-sessions/*/complete').as('completeSession')

      cy.get('input[type="file"]', { timeout: 20000 }).selectFile('cypress/fixtures/sample.geojson', { force: true })
      cy.contains('button', 'Upload').click()
      cy.wait('@startSession', { timeout: 60000 })
      cy.wait('@uploadPart', { timeout: 60000 })
      cy.wait('@completeSession', { timeout: 120000 })
      cy.contains('Ready', { timeout: 120000 }).should('be.visible')
      cy.contains('sample.geojson', { timeout: 20000 }).should('be.visible')

      cy.get('button#dekart-save-button', { timeout: 20000 }).click()
      cy.get('button#dekart-save-button', { timeout: 60000 }).should('not.be.disabled')

      cy.get('span[title="Dataset setting"]', { timeout: 20000 }).click()
      cy.get('input#dekart-dataset-name-input').should('be.visible')
      cy.get('input#dekart-dataset-name-input').type('Station Zones')
      cy.get('button#dekart-save-dataset-name-button').click()
      cy.contains('span', 'Station Zones', { timeout: 20000 }).should('be.visible')

      cy.visit(`${appUrl}/reports/${reportId}/source`, {
        onBeforeLoad (win) {
          const OriginalFile = win.File
          win.__dekartConstructedFileNames = []
          win.File = class extends OriginalFile {
            constructor (parts, name, options) {
              win.__dekartConstructedFileNames.push({
                name,
                type: options?.type || ''
              })
              super(parts, name, options)
            }
          }
        }
      })
      waitForNoDownloadMessage()

      cy.get('body', { timeout: 120000 }).should(($body) => {
        const text = $body.text()
        expect(text, 'GeoJSON load error').not.to.include('Error loading dataset')
        expect(text, 'extensionless dataset label').to.include('Station Zones')
      })

      cy.window().its('__dekartConstructedFileNames').should((files) => {
        expect(files, 'downloaded File constructor calls').to.deep.include({
          name: 'Station Zones.geojson',
          type: 'application/geo+json'
        })
      })
    })
  })
})
