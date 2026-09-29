/* global cy, Cypress, expect */

// The E2E image runs against the built app and does not include Kepler's node package.
export function addLayer (config) {
  return { type: '@@kepler.gl/ADD_LAYER', config }
}

export function setPolygonFilterLayer (layer, feature) {
  return { type: '@@kepler.gl/SET_POLYGON_FILTER_LAYER', layer, feature }
}

export const SIX_ROW_QUERY = "SELECT CASE WHEN i < 3 THEN 52.5 ELSE 42.5 END + i / 100 AS latitude, CASE WHEN i < 3 THEN 13.4 ELSE 23.4 END + i / 100 AS longitude, CASE WHEN i < 3 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)"
export const H3_QUERY = "SELECT h3_latlng_to_cell_string(CASE WHEN i < 3 THEN 52.5 ELSE 42.5 END + i / 100, CASE WHEN i < 3 THEN 13.4 ELSE 23.4 END + i / 100, 7) AS h3, CASE WHEN i < 3 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i) UNION ALL SELECT 'not-a-cell' AS h3, 'Invalid' AS category"
export const DECIMAL_H3_QUERY = "SELECT CAST(h3_latlng_to_cell(CASE WHEN i < 3 THEN 52.5 ELSE 42.5 END + i / 100, CASE WHEN i < 3 THEN 13.4 ELSE 23.4 END + i / 100, 7) AS VARCHAR) AS h3, CASE WHEN i < 3 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i) UNION ALL SELECT 'not-a-cell' AS h3, 'Invalid' AS category"
export const GEOJSON_QUERY = 'SELECT CASE WHEN i < 3 THEN \'{"type":"Polygon","coordinates":[[[13.3,52.4],[13.5,52.4],[13.5,52.6],[13.3,52.4]]]}\' ELSE \'{"type":"Polygon","coordinates":[[[23.3,42.4],[23.5,42.4],[23.5,42.6],[23.3,42.4]]]}\' END AS geometry, CASE WHEN i < 3 THEN \'Alpha\' ELSE \'Beta\' END AS category FROM range(6) t(i)'
export const GEOMETRY_QUERY = "SELECT ST_GeomFromText(CASE WHEN i < 3 THEN 'POINT (13.4 52.5)' ELSE 'POINT (23.4 42.5)' END) AS geometry, CASE WHEN i < 3 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)"
export const GEOARROW_POINT_QUERY = "SELECT CAST([CASE WHEN i < 3 THEN 13.4 ELSE 23.4 END + i / 100, CASE WHEN i < 3 THEN 52.5 ELSE 42.5 END + i / 100] AS DOUBLE[2]) AS location, CASE WHEN i < 3 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)"
export const GEOARROW_ARC_QUERY = "SELECT CAST([CASE WHEN i < 3 THEN 13.4 ELSE 23.4 END + i / 100, CASE WHEN i < 3 THEN 52.5 ELSE 42.5 END + i / 100] AS DOUBLE[2]) AS arc_start, CAST([0, 0, CASE WHEN i < 3 THEN 13.405 ELSE 23.405 END + i / 100, CASE WHEN i < 3 THEN 52.505 ELSE 42.505 END + i / 100] AS DOUBLE[4]) AS arc_end, CASE WHEN i < 3 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i) UNION ALL SELECT CAST([13.4, 52.5] AS DOUBLE[2]), CAST([0, 0, 23.4, 42.5] AS DOUBLE[4]), 'Cross start' UNION ALL SELECT CAST([23.4, 42.5] AS DOUBLE[2]), CAST([0, 0, 13.4, 52.5] AS DOUBLE[4]), 'Cross end'"

export function reduxStore (win) {
  const root = win.document.getElementById('root')._reactRootContainer
  return root.current.child.memoizedProps.store
}

// Open a fresh DuckDB report and wait for its initial chart count.
export function openChartReport (emailPrefix, query, count) {
  cy.viewport(1280, 960)
  const email = `${emailPrefix}-${Date.now()}@example.com`
  cy.setDevClaimsEmail(email)
  cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
    request.headers['X-Dekart-Claim-Email'] = email
  })
  cy.visit('/')
  cy.ensureTestWorkspace()
  cy.get('#dekart-create-report').click()
  cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
  cy.get('.ace_editor:not(.ace_autocomplete):visible textarea', { timeout: 120000 })
  cy.enterQuery(query)
  cy.get('#dekart-query-execute-button').should('be.enabled').click()
  cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
  cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).then(button => {
    if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
  })
  cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', count)
}

// Bind a precise polygon after drawing so bbox-center and vertex-mean behavior can be distinguished.
export function bindPrecisePolygon (layerType, [longitude, latitude] = [13.4, 52.5], radius = 0.03) {
  cy.get('.map-control-button.map-draw').click()
  cy.get('.map-draw-controls .draw-rectangle').click()
  cy.get('#view-MapView').then(overlay => {
    const width = overlay.width()
    const height = overlay.height()
    cy.wrap(overlay).click(width * 0.45, height * 0.55)
    cy.wrap(overlay).trigger('pointermove', width * 0.75, height * 0.8, { pointerType: 'mouse' })
    cy.wrap(overlay).click(width * 0.75, height * 0.8)
  })
  cy.window().then(win => {
    const store = reduxStore(win)
    const { layers, editor } = store.getState().keplerGl.kepler.visState
    const layer = layers.find(layer => layer.type === layerType)
    expect(layer).to.not.equal(undefined)
    const feature = {
      ...editor.features[0],
      properties: { shape: 'Polygon' },
      geometry: { type: 'Polygon', coordinates: [[[longitude - radius, latitude - radius], [longitude + radius, latitude - radius], [longitude + radius, latitude + radius], [longitude - radius, latitude + radius], [longitude - radius, latitude - radius]]] }
    }
    store.dispatch(setPolygonFilterLayer(layer, feature))
  })
}

// Far-apart clusters keep the screen-relative rectangle on one group after auto-fit.
