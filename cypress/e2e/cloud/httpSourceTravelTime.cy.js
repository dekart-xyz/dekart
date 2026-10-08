/* eslint-disable no-undef */
import { createReport, runActiveDuckDBQuery, selectDuckDB, replaceEditorText } from '../local/duckdbHelpers'

const owner = 'traveltime-demo@dekart.xyz'
const viewer = 'traveltime-viewer@dekart.xyz'
const appID = Cypress.env('TRAVLEL_TIME_APP_ID')
const apiKey = Cypress.env('TRAVLEL_TIME_APP_KEY')

// renameDataset gives the authored dataset its label before another query references it.
function renameDataset (name) {
  cy.get('.ant-tabs-tab-active .ant-tabs-tab-remove').click()
  cy.get('#dekart-dataset-name-input').clear().type(name)
  cy.get('#dekart-save-dataset-name-button').click()
  cy.get('#dekart-dataset-name-input').should('not.exist')
}

// createTravelTimeSource stores the live credentials through the ordinary encrypted form.
function createTravelTimeSource () {
  cy.visit('/connections')
  cy.get('#dekart-connection-type-card-bigquery, #dekart-new-connection-connections, #dekart-new-connection-onboarding', { timeout: 30000 }).should('exist')
  cy.get('body').then($body => {
    if ($body.find('#dekart-new-connection-connections').length) cy.get('#dekart-new-connection-connections').click()
    else if ($body.find('#dekart-new-connection-onboarding').length) cy.get('#dekart-new-connection-onboarding').click()
  })
  cy.get('#dekart-connection-type-card-http').click()
  cy.get('#connectionName').clear().type('TravelTime demonstration')
  cy.get('#httpBaseUrl').type('https://api.traveltimeapp.com/v4/')
  cy.contains('button', 'Add header').click()
  cy.get('#httpHeaderRows_0_name').type('X-Application-Id')
  cy.get('#httpHeaderRows_0_value').type(appID, { log: false })
  cy.contains('button', 'Add header').click()
  cy.get('#httpHeaderRows_1_name').type('X-Api-Key')
  cy.get('#httpHeaderRows_1_value').type(apiKey, { log: false })
  cy.get('#saveConnection').click()
  cy.get('.ant-modal').should('not.exist')
}

// This live proof is opt-in; ordinary CI uses the public fixture acceptance specs.
const liveDescribe = appID && apiKey ? describe : describe.skip
liveDescribe('TravelTime catchment from a selected station', () => {
  it('shows the real polygon and station fields to a shared viewer', () => {
    cy.setDevClaimsEmail(owner)
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.psql("UPDATE connections SET archived=true WHERE connection_name='TravelTime demonstration'")
    createTravelTimeSource()
    createReport()
    cy.location('pathname').should('match', /reports\/[0-9a-f-]+\/source/).then(path => {
      cy.writeFile('cypress/downloads/traveltime-viewer-path.txt', path.replace(/\/source$/, ''))
    })
    runActiveDuckDBQuery("SELECT 'demo-berlin' AS station_id, 'Berlin demonstration station' AS name, 150 AS power_kw, 52.5 AS latitude, 13.4 AS longitude")
    renameDataset('Stations')
    cy.get('button.ant-tabs-nav-add:visible').first().click()
    cy.contains('[role="tab"]', 'New').click({ force: true })
    selectDuckDB()
    const arrival = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/\.\d+Z$/, 'Z')
    replaceEditorText(`WITH response AS (
      SELECT * FROM read_json((SELECT format('https://api.traveltimeapp.com/v4/time-map?type=driving&travel_time=900&lat={}&lng={}&arrival_time=${encodeURIComponent(arrival)}', latitude, longitude)
      FROM datasets."Stations" WHERE station_id='demo-berlin'))
    ), shapes AS (
      SELECT unnest(result.shapes) AS shape FROM response, UNNEST(results) AS t(result)
    ) SELECT station.name, station.power_kw,
      ST_GeomFromGeoJSON(json_object('type', 'Polygon', 'coordinates',
        list_prepend(list_transform(shape.shell, p -> [p.lng, p.lat]),
        list_transform(shape.holes, h -> list_transform(h, p -> [p.lng, p.lat]))))) AS catchment
      FROM shapes CROSS JOIN datasets."Stations" station WHERE station_id='demo-berlin'`)
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.assertDatasetTable('Query 2', ['name', 'power_kw'], ['Berlin demonstration station', '150'])
    cy.openLayerPanel()
    cy.contains('.layer__title__type', 'geojson').should('be.visible')
    cy.get('span[title="Click to edit map title"]').click()
    cy.get('#dekart-report-title-input').clear().type('TravelTime: Berlin demonstration station{enter}')
    cy.get('#dekart-save-button').should('be.enabled').click()
    cy.get('#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
    cy.readFile('cypress/downloads/traveltime-viewer-path.txt').then(path => {
      const report = path.match(/reports\/([0-9a-f-]+)/)[1]
      cy.psql(`INSERT INTO report_access_log (report_id,email,status,access_level,authored_by) VALUES ('${report}','${viewer}',1,1,'${owner}');`)
      cy.setDevClaimsEmail(viewer)
      cy.visit(path)
      cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')
      cy.assertDatasetTable('Query 2', ['name', 'power_kw'], ['Berlin demonstration station', '150'])
      cy.openLayerPanel()
      cy.contains('.layer__title__type', 'geojson').should('be.visible')
      cy.get('.mapboxgl-canvas').first().screenshot('traveltime-shared-viewer', { overwrite: true })
    })
  })
})
