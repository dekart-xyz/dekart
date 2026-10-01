/* eslint-disable no-undef */
import { LAYER_SELECTOR, createReport } from '../local/duckdbHelpers'

// Keep the customer query and parameter behavior with a small result for CI.
const ROW_LIMIT = 1000
const SQL = `SELECT
lat,
lng,
station_code,
ROUND(planned_service_s / 60, 1) AS service_min
FROM \`dekart-data-samples.demo_data_samples.last_mile_dropoffs\`
WHERE ROUND(planned_service_s / 60, 1) < 10
AND packages < 5
AND station_code LIKE {{station}}
LIMIT ${ROW_LIMIT}`

// Save through the UI before applying parameters, as required by the report editor.
function saveReport () {
  cy.get('#dekart-save-button').should('be.enabled').click()
  cy.get('#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
}

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
    cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN')
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN', '/connections')
    cy.contains('.ant-radio-button-wrapper', 'Connections').click()
    cy.location('pathname').should('eq', '/connections')
    cy.get('body').then($body => {
      // Existing workspaces open their connection list instead of the first-run chooser.
      if (!$body.find('#dekart-connection-type-card-bigquery').length) {
        cy.get('#dekart-new-connection-connections, #dekart-new-connection-onboarding').first().click()
      }
    })
    cy.get('#dekart-connection-type-card-bigquery').click()
    cy.location('pathname').then(path => cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN', path))
    cy.contains('button', 'Connect with Google').click()
    cy.contains('.ant-modal-title', 'BigQuery', { timeout: 30000 }).should('be.visible')
    const connectionName = `Parameter BigQuery reproduction ${Date.now()}`
    cy.get('input#connectionName').clear().type(connectionName)
    cy.get('input#bigqueryProjectId').clear().type('dekart-dev')
    cy.get('input#cloudStorageBucket').clear().type('dekart-dev')
    cy.get('#testConnection').click()
    cy.get('#saveConnection', { timeout: 60000 }).should('be.enabled').click()
    cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN', '/')
    createReport()
    cy.contains('button', connectionName, { timeout: 30000 }).scrollIntoView().click({ force: true })
    cy.enterQuery(SQL)
    cy.contains('.ant-input-group-addon', 'station', { timeout: 30000 }).should('be.visible')
    saveReport()
    cy.contains('.ant-input-group-addon', 'station').parent().find('input').first().clear().type('DLA5%')
    cy.get('button[title="Apply query parameters"]').should('be.enabled').click()
    cy.assertDatasetRows('Query 1', ROW_LIMIT)
    cy.get(LAYER_SELECTOR).should('have.length', 1)
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
    cy.contains('.ant-select', 'Viewing').click()
    cy.contains('.ant-select-item-option-content', 'Editing').click()
    cy.location('pathname').should('match', /\/source$/)
    cy.openLayerPanel()
    applyStation('DLA5', ROW_LIMIT)
  })
})
