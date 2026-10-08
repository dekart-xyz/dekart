/* eslint-disable no-undef */
import { createReport, runActiveDuckDBQuery, selectDuckDB, replaceEditorText } from '../local/duckdbHelpers'

const owner = 'vaylens-isochrones@dekart.xyz'
const viewer = 'vaylens-isochrones-viewer@dekart.xyz'
const auth = Cypress.env('VAYLENS_API_AUTH')
const appID = Cypress.env('TRAVLEL_TIME_APP_ID')
const apiKey = Cypress.env('TRAVLEL_TIME_APP_KEY')
const stationCount = 3
const stationURL = 'https://apiqa.services-emobility.com/mobileapi/v5/charging-stations?latitudeFrom=47&longitudeFrom=5&latitudeTo=55.2&longitudeTo=15.5&pageSize=250&page=0'

// createSource sends credentials through the normal encrypted connection form.
function createSource (name, base, headers) {
  cy.visit('/connections')
  cy.get('#dekart-connection-type-card-bigquery, #dekart-new-connection-connections, #dekart-new-connection-onboarding', { timeout: 30000 }).should('exist')
  cy.get('body').then($body => {
    if ($body.find('#dekart-new-connection-connections').length) cy.get('#dekart-new-connection-connections').click()
    else if ($body.find('#dekart-new-connection-onboarding').length) cy.get('#dekart-new-connection-onboarding').click()
  })
  cy.get('#dekart-connection-type-card-http').click()
  cy.get('#connectionName').clear().type(name)
  cy.get('#httpBaseUrl').type(base)
  headers.forEach(([header, value], index) => {
    cy.contains('button', 'Add header').click()
    cy.get(`#httpHeaderRows_${index}_name`).type(header)
    cy.get(`#httpHeaderRows_${index}_value`).type(value, { log: false })
  })
  cy.get('#saveConnection').click()
  cy.get('.ant-modal').should('not.exist')
}

// createIsochrone runs one request selected by station id, then joins the station fields.
function createIsochrone (station, index, arrival) {
  expect(station.uuid).to.match(/^[a-f0-9-]{36}$/i)
  cy.get('button.ant-tabs-nav-add:visible').first().click()
  cy.contains('[role="tab"]', 'New').click({ force: true })
  selectDuckDB()
  cy.intercept('GET', '**/dataset-source/**').as(`isochrone${index}`)
  replaceEditorText(`WITH response AS (
    SELECT * FROM read_json((SELECT format('https://api.traveltimeapp.com/v4/time-map?type=driving&travel_time=900&lat={}&lng={}&arrival_time=${encodeURIComponent(arrival)}', latitude, longitude)
      FROM datasets."Stations" WHERE station_id='${station.uuid}'))
  ), shapes AS (
    SELECT unnest(result.shapes) AS shape FROM response, UNNEST(results) AS t(result)
  ) SELECT station.station_id, station.latitude, station.longitude,
    ST_GeomFromGeoJSON(json_object('type', 'Polygon', 'coordinates',
      list_prepend(list_transform(shape.shell, p -> [p.lng, p.lat]),
      list_transform(CAST(shape.holes AS STRUCT(lat DOUBLE, lng DOUBLE)[][]), h -> list_transform(h, p -> [p.lng, p.lat]))))) AS catchment
    FROM shapes CROSS JOIN datasets."Stations" station WHERE station_id='${station.uuid}'`)
  cy.get('#dekart-query-execute-button').click()
  cy.wait(`@isochrone${index}`, { timeout: 120000 }).then(({ request, response }) => {
    expect(response.statusCode).to.eq(200)
    const resolved = new URL(new URL(request.url).searchParams.get('url'))
    expect(resolved.origin).to.eq('https://api.traveltimeapp.com')
    expect(Number(resolved.searchParams.get('lat'))).to.eq(Number(station.latitude))
    expect(Number(resolved.searchParams.get('lng'))).to.eq(Number(station.longitude))
    expect(resolved.searchParams.get('travel_time')).to.eq('900')
  })
  cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
  cy.assertDatasetTable(`Query ${index + 2}`, ['station_id', 'latitude', 'longitude', 'catchment'], [station.uuid])
  cy.contains('.layer__title__type', 'geojson').should('be.visible')
}

// Live vendor requests are opt-in; ordinary CI uses the public fixture specs.
const liveDescribe = auth && appID && apiKey ? describe : describe.skip
liveDescribe('Vaylens stations and a TravelTime isochrone for each station', () => {
  it('fetches real stations, maps every returned station and rebuilds all polygons for a viewer', () => {
    cy.setDevClaimsEmail(owner)
    cy.visit('/')
    cy.ensureTestWorkspace()
    createReport()
    cy.location('pathname').should('match', /reports\/[0-9a-f-]+\/source/).then(path => {
      cy.writeFile('cypress/downloads/vaylens-isochrones-viewer-path.txt', path.replace(/\/source$/, ''))
    })
    cy.psql("UPDATE connections SET archived=true WHERE connection_name IN ('Vaylens isochrones E2E', 'TravelTime isochrones E2E')")
    createSource('Vaylens isochrones E2E', 'https://apiqa.services-emobility.com/', [['Authorization', auth]])
    createSource('TravelTime isochrones E2E', 'https://api.traveltimeapp.com/v4/', [['X-Application-Id', appID], ['X-Api-Key', apiKey]])
    cy.readFile('cypress/downloads/vaylens-isochrones-viewer-path.txt').then(path => cy.visit(`${path}/source`))
    cy.intercept('GET', '**/dataset-source/**').as('stationDownload')
    runActiveDuckDBQuery(`SELECT uuid AS station_id, CAST(latitude AS DOUBLE) AS latitude, CAST(longitude AS DOUBLE) AS longitude FROM read_json('${stationURL}') LIMIT ${stationCount}`)
    cy.assertDatasetRows('Query 1', stationCount)
    cy.get('.ant-tabs-tab-active .ant-tabs-tab-remove').click()
    cy.get('#dekart-dataset-name-input').clear().type('Stations')
    cy.get('#dekart-save-dataset-name-button').click()
    cy.get('#dekart-dataset-name-input').should('not.exist')
    cy.wait('@stationDownload').then(({ response }) => {
      expect(response.statusCode).to.eq(200)
      const stations = JSON.parse(Cypress.Buffer.from(response.body).toString('utf8')).slice(0, stationCount)
      expect(stations).to.have.length(stationCount)
      expect(new Set(stations.map(station => station.uuid)).size).to.eq(stationCount)
      const arrival = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/\.\d+Z$/, 'Z')
      stations.forEach((station, index) => createIsochrone(station, index, arrival))
      cy.get('span[title="Click to edit map title"]').click()
      cy.get('#dekart-report-title-input').clear().type('Vaylens: 15-minute driving isochrones{enter}')
      cy.get('#dekart-save-button').should('be.enabled').click()
      cy.get('#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
      cy.readFile('cypress/downloads/vaylens-isochrones-viewer-path.txt').then(path => {
        const report = path.match(/reports\/([0-9a-f-]+)/)[1]
        cy.psql(`INSERT INTO report_access_log (report_id,email,status,access_level,authored_by) VALUES
          ('${report}','${viewer}',1,1,'${owner}'), ('${report}','vladi@dekart.xyz',1,1,'${owner}');`)
        cy.setDevClaimsEmail(viewer)
        cy.visit(path)
        stations.forEach((station, index) => {
          cy.assertDatasetTable(`Query ${index + 2}`, ['station_id', 'catchment'], [station.uuid])
        })
        cy.openLayerPanel()
        cy.get('.layer__title__type').filter(':contains("geojson")').should('have.length', stationCount)
        cy.get('.mapboxgl-canvas').first().screenshot('vaylens-isochrones-shared-viewer', { overwrite: true })
      })
    })
  })
})
