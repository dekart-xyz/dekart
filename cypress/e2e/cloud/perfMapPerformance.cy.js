/* eslint-disable no-undef */
import { captureMapScreenshot, formatMapPerformance, measureMapZoomPerformance } from '../../support/mapPerformance'

const performanceReportId = Cypress.env('performanceReportId')
const performanceDatasetName = Cypress.env('performanceDatasetName')
const performanceRows = Number(Cypress.env('performanceRows'))
const performanceLayerType = Cypress.env('performanceLayerType')
const performanceLabel = Cypress.env('performanceLabel') || performanceLayerType
const performanceEmail = Cypress.env('performanceEmail')
const performanceDescribe = Cypress.env('runPerformance') ? describe : describe.skip

// This opt-in benchmark receives locally seeded report metadata through Cypress --env arguments.

performanceDescribe('large map performance', () => {
  beforeEach(() => {
    expect(performanceEmail, 'performanceEmail').to.match(/\S/)
    cy.setDevClaimsEmail(performanceEmail)
  })

  it('keeps a large map responsive while zooming', () => {
    expect(performanceReportId, 'performanceReportId').to.match(/\S/)
    expect(performanceDatasetName, 'performanceDatasetName').to.match(/\S/)
    expect(performanceRows, 'performanceRows').to.be.greaterThan(0)
    expect(performanceLayerType, 'performanceLayerType').to.match(/\S/)
    cy.viewport(1920, 1080)
    cy.visit(`/reports/${performanceReportId}`)
    cy.get('.side-panel--container', { timeout: 30000 }).then($panel => {
      // Saved reports can load with the layer panel either open or closed.
      if ($panel.width() === 0) {
        cy.get('.side-bar__close').click({ force: true })
      }
    })
    cy.contains('.source-data-title .dataset-name', performanceDatasetName, { timeout: 300000 }).should('be.visible')
    cy.contains('.source-data-rows', `${performanceRows.toLocaleString('en-US')} rows`).should('be.visible')
    cy.contains('.layer__title__type', performanceLayerType, { timeout: 120000 }).should('be.visible')
    cy.get('.mapboxgl-canvas', { timeout: 30000 }).should($canvas => {
      const bounds = $canvas[0].getBoundingClientRect()
      expect(bounds.width, 'map width').to.be.greaterThan(0)
      expect(bounds.height, 'map height').to.be.greaterThan(0)
    })

    cy.get('.layer__visibility-toggle').should('have.length', 1).find('.data-ex-icons-eyeseen').should('be.visible')
    cy.get('.layer__visibility-toggle').click()
    cy.get('.side-bar__close').click({ force: true })
    cy.wait(5000)

    let hiddenLayerPixels
    cy.get('.mapboxgl-canvas').then($canvas => captureMapScreenshot($canvas[0])).then(screenshot => {
      hiddenLayerPixels = screenshot.data
    })
    cy.get('.side-bar__close').click({ force: true })
    cy.get('.layer__visibility-toggle').click()
    cy.get('.side-bar__close').click({ force: true })
    cy.wait(500)

    cy.get('.mapboxgl-canvas').then({ timeout: 120000 }, $canvas => {
      return measureMapZoomPerformance($canvas[0], 3000, hiddenLayerPixels)
    }).then(({ fps, p95Frame, maxFrame, longTaskTime, maxLongTask }) => {
      const result = formatMapPerformance({ fps, p95Frame, maxFrame, longTaskTime, maxLongTask })
      cy.task('performanceResult', `${performanceLabel}: ${result}`)

      expect(fps, result).to.be.at.least(20)
      expect(p95Frame, result).to.be.at.most(100)
      expect(maxFrame, result).to.be.at.most(200)
      expect(maxLongTask, result).to.be.at.most(150)
    })
  })
})
