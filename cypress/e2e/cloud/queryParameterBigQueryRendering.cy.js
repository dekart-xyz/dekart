/* eslint-disable no-undef */
import { LAYER_SELECTOR } from '../local/duckdbHelpers'
import { ROW_LIMIT, createParameterizedReport, saveReport } from './queryParameterHelpers'

// Count rendered colored pixels outside the side panel, without reading app state.
function assertRenderedPoints (name, attempts = 10, visible = true) {
  cy.wait(1000)
  cy.get('.mapboxgl-canvas').first().screenshot(name, { overwrite: true })
  cy.readFile(`cypress/screenshots/${Cypress.spec.name}/${name}.png`, 'base64').then(data => {
    return cy.window().then(win => new Cypress.Promise((resolve, reject) => {
      const image = new win.Image()
      image.onerror = reject
      image.onload = () => {
        const canvas = win.document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0)
        const pixels = context.getImageData(0, 0, image.width, image.height).data
        let points = 0
        for (let y = Math.floor(image.height * 0.2); y < image.height * 0.9; y += 2) {
          for (let x = Math.floor(image.width * 0.5); x < image.width * 0.95; x += 2) {
            const i = (y * image.width + x) * 4
            const warm = pixels[i] > 120 && pixels[i + 2] < 100
            const teal = pixels[i] < 50 && pixels[i + 1] > 100 && pixels[i + 2] > 100
            const pink = pixels[i] > 150 && pixels[i + 2] > 120 &&
              pixels[i] - pixels[i + 1] > 30 && pixels[i + 2] - pixels[i + 1] > 20
            if (warm || teal || pink) points++
          }
        }
        resolve(points)
      }
      image.src = `data:image/png;base64,${data}`
    }))
  }).then(points => {
    // Retry screenshots while the asynchronous GPU frame is still being presented.
    if (visible && points <= 100 && attempts > 1) return assertRenderedPoints(name, attempts - 1)
    if (visible) {
      expect(points, 'visible map points without clicking a layer').to.be.greaterThan(100)
    } else {
      expect(points, 'no colored points with both layers hidden').to.be.lessThan(100)
    }
  })
}

// Apply the customer parameter through the same visible form used in the report.
function applyStation (station, rows) {
  cy.contains('.ant-input-group-addon', 'station').parent().find('input').first().clear()
  // An empty value reproduces opening the saved map with qp_station= before applying DLA5.
  if (station) cy.contains('.ant-input-group-addon', 'station').parent().find('input').first().type(station)
  cy.intercept('POST', '**/Dekart/RunAllQueries').as('applyParameters')
  cy.intercept('GET', '**/dataset-source/**').as('parameterData')
  cy.get('button[title="Apply query parameters"]').should('be.enabled').click()
  cy.wait('@applyParameters', { timeout: 120000 }).its('response.statusCode').should('eq', 200)
  cy.wait('@parameterData', { timeout: 120000 }).its('response.statusCode').should('eq', 200)
  cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')
  cy.contains('.source-data-rows', `${rows.toLocaleString('en-US')} rows`, { timeout: 120000 }).should('be.visible')
  cy.get(LAYER_SELECTOR).should('have.length', 2)
  cy.get('.layer__is-valid-refresh').should('not.exist')
  cy.contains('A map layer could not be displayed').should('not.exist')
  assertRenderedPoints(`station-${station || 'empty'}`, 10, rows > 0)
}

describe('query parameter layer rendering reproduction', () => {
  it('renders capped query results after parameter changes without clicking a layer', () => {
    createParameterizedReport()
    cy.get('.layer__duplicate .panel--header__action__component').first().click({ force: true })
    cy.get(LAYER_SELECTOR).should('have.length', 2)
    saveReport()
    cy.location('pathname').then(path => {
      cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN', `${path}?qp_station=DLA5%25`)
      cy.visit(`${path}?qp_station=DLA5%25`)
    })
    cy.assertDatasetRows('Query 1', ROW_LIMIT)
    cy.get(LAYER_SELECTOR).should('have.length', 2)
    // Establish that each configured layer draws points before exercising parameter changes.
    cy.get('.layer__visibility-toggle .panel--header__action__component').eq(0).click()
    cy.get('.layer__visibility-toggle .panel--header__action__component').eq(1).click()
    assertRenderedPoints('hidden-layer-control', 1, false)
    cy.get('.layer__visibility-toggle .panel--header__action__component').eq(0).click()
    assertRenderedPoints('first-layer-control')
    cy.get('.layer__visibility-toggle .panel--header__action__component').eq(0).click()
    cy.get('.layer__visibility-toggle .panel--header__action__component').eq(1).click()
    assertRenderedPoints('second-layer-control')
    cy.get('.layer__visibility-toggle .panel--header__action__component').eq(0).click()
    saveReport()
    assertRenderedPoints('before-parameters')
    applyStation('', 0)
    saveReport()
    applyStation('DLA5', ROW_LIMIT)
    saveReport()
    applyStation('DLA5%', ROW_LIMIT)
    saveReport()
    applyStation('DLA5', ROW_LIMIT)
    saveReport()
    // Reproduce entering the editor from an empty-parameter viewer, rather than
    // loading the editor directly with an already populated dataset.
    cy.location('pathname').then(path => {
      const viewerPath = `${path.replace(/\/source$/, '')}?qp_station=`
      cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN', viewerPath)
      cy.visit(viewerPath)
    })
    cy.contains('.ant-select', 'Viewing', { timeout: 30000 }).should('be.visible')
    cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')
    cy.contains('.ant-input-group-addon', 'station').parent().find('input').first().type('DLA5')
    cy.intercept('POST', '**/Dekart/UpdateReport').as('transitionSave')
    cy.contains('.ant-select', 'Viewing').click()
    cy.contains('.ant-select-item-option-content', 'Editing').click()
    cy.location('pathname').should('match', /\/source$/)
    // Allow the autosave timer to fire before checking that temporary viewer input was discarded.
    cy.wait(2500)
    cy.get('@transitionSave.all').should('have.length', 0)
    cy.contains('.ant-input-group-addon', 'station').parent().find('input').first().should('have.value', '')
    cy.openLayerPanel()
    applyStation('DLA5', ROW_LIMIT)
  })
})
