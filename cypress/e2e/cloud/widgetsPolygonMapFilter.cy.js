/* global cy, describe, it, Cypress, expect */
import { addLayer, setPolygonFilterLayer } from '@kepler.gl/actions'

const SIX_ROW_QUERY = "SELECT CASE WHEN i < 3 THEN 52.5 ELSE 42.5 END + i / 100 AS latitude, CASE WHEN i < 3 THEN 13.4 ELSE 23.4 END + i / 100 AS longitude, CASE WHEN i < 3 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)"
const H3_QUERY = "SELECT h3_latlng_to_cell_string(CASE WHEN i < 3 THEN 52.5 ELSE 42.5 END + i / 100, CASE WHEN i < 3 THEN 13.4 ELSE 23.4 END + i / 100, 7) AS h3, CASE WHEN i < 3 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i) UNION ALL SELECT 'not-a-cell' AS h3, 'Invalid' AS category"
const DECIMAL_H3_QUERY = "SELECT CAST(h3_latlng_to_cell(CASE WHEN i < 3 THEN 52.5 ELSE 42.5 END + i / 100, CASE WHEN i < 3 THEN 13.4 ELSE 23.4 END + i / 100, 7) AS VARCHAR) AS h3, CASE WHEN i < 3 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i) UNION ALL SELECT 'not-a-cell' AS h3, 'Invalid' AS category"
const GEOJSON_QUERY = 'SELECT CASE WHEN i < 3 THEN \'{"type":"Polygon","coordinates":[[[13.3,52.4],[13.5,52.4],[13.5,52.6],[13.3,52.4]]]}\' ELSE \'{"type":"Polygon","coordinates":[[[23.3,42.4],[23.5,42.4],[23.5,42.6],[23.3,42.4]]]}\' END AS geometry, CASE WHEN i < 3 THEN \'Alpha\' ELSE \'Beta\' END AS category FROM range(6) t(i)'
const GEOMETRY_QUERY = "SELECT ST_GeomFromText(CASE WHEN i < 3 THEN 'POINT (13.4 52.5)' ELSE 'POINT (23.4 42.5)' END) AS geometry, CASE WHEN i < 3 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)"
const GEOARROW_POINT_QUERY = "SELECT CAST([CASE WHEN i < 3 THEN 13.4 ELSE 23.4 END + i / 100, CASE WHEN i < 3 THEN 52.5 ELSE 42.5 END + i / 100] AS DOUBLE[2]) AS location, CASE WHEN i < 3 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)"
const GEOARROW_ARC_QUERY = "SELECT CAST([CASE WHEN i < 3 THEN 13.4 ELSE 23.4 END + i / 100, CASE WHEN i < 3 THEN 52.5 ELSE 42.5 END + i / 100] AS DOUBLE[2]) AS arc_start, CAST([0, 0, CASE WHEN i < 3 THEN 13.405 ELSE 23.405 END + i / 100, CASE WHEN i < 3 THEN 52.505 ELSE 42.505 END + i / 100] AS DOUBLE[4]) AS arc_end, CASE WHEN i < 3 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i) UNION ALL SELECT CAST([13.4, 52.5] AS DOUBLE[2]), CAST([0, 0, 23.4, 42.5] AS DOUBLE[4]), 'Cross start' UNION ALL SELECT CAST([23.4, 42.5] AS DOUBLE[2]), CAST([0, 0, 13.4, 52.5] AS DOUBLE[4]), 'Cross end'"

function reduxStore (win) {
  const root = win.document.getElementById('root')._reactRootContainer
  return root.current.child.memoizedProps.store
}

// Open a fresh DuckDB report and wait for its initial chart count.
function openChartReport (emailPrefix, query, count) {
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
  cy.enterQuery(query)
  cy.get('#dekart-query-execute-button').should('be.enabled').click()
  cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
  cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).then(button => {
    if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
  })
  cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', count)
}

// Bind a precise polygon after drawing so bbox-center and vertex-mean behavior can be distinguished.
function bindPrecisePolygon (layerType, [longitude, latitude] = [13.4, 52.5], radius = 0.03) {
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
describe('widgets with a polygon map filter', () => {
  for (const layerLabel of [null, 'Named points']) {
    it(`filters charts for a ${layerLabel || 'default'} point layer`, () => {
      openChartReport('widgets-polygon-filter', SIX_ROW_QUERY, '6')
      if (layerLabel) {
        cy.get('[data-testid="map-settings-tab"]').click()
        cy.get('.layer__title__editor').first().clear().type(layerLabel).blur()
        cy.get('[data-testid="widgets-tab"]').click()
      }

      // Draw a rectangle in the map area beside the Charts panel and use it to filter the point layer.
      cy.get('.map-control-button.map-draw').click()
      cy.get('.map-draw-controls .draw-rectangle').click()
      cy.get('#view-MapView').then(overlay => {
        const width = overlay.width()
        const height = overlay.height()
        cy.wrap(overlay).click(width * 0.45, height * 0.55)
        cy.wrap(overlay).trigger('pointermove', width * 0.75, height * 0.8, { pointerType: 'mouse' })
        cy.wrap(overlay).click(width * 0.75, height * 0.8)
      })
      // Electron cannot reliably pick the unfilled border; invoke Kepler's same Filter Layers action.
      cy.window().then(win => {
        const store = reduxStore(win)
        const { layers, editor } = store.getState().keplerGl.kepler.visState
        const layer = layers.find(layer => layer.type === 'point')
        store.dispatch(setPolygonFilterLayer(layer, editor.features[0]))
      })

      cy.get('[data-testid="filter-strip"]').should('contain.text', 'Map area').and('not.contain.text', 'No filters')
      if (layerLabel) cy.get('[data-testid="filter-strip"] button[title]').should('have.attr', 'title').and('contain', layerLabel)
      cy.contains('Could not apply map filters', { timeout: 30000 }).should('not.exist')
      cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
      cy.get('[data-testid="category-chart"]').should('contain.text', 'Beta').and('not.contain.text', 'Alpha')
      cy.wait(2500)
      cy.reload()
      cy.get('[data-testid="number-value"]', { timeout: 180000 }).should('have.text', '3')
      cy.get('[data-testid="filter-strip"]').should('contain.text', 'Map area')
      cy.get('button[aria-label="Remove Map area filter"]').click()
      cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '6')
    })
  }

  for (const [format, query] of [['hexadecimal', H3_QUERY], ['decimal strings', DECIMAL_H3_QUERY]]) {
    it(`filters charts by ${format} H3 cell centroids`, () => {
      openChartReport('widgets-polygon-h3', query, '7')

      if (format === 'decimal strings') {
        // Decimal strings are not inferred as H3, so bind the column as a user would.
        cy.window().then(win => {
          const store = reduxStore(win)
          const dataset = Object.values(store.getState().keplerGl.kepler.visState.datasets)[0]
          const fieldIdx = dataset.fields.findIndex(field => field.name === 'h3')
          expect(fieldIdx).to.be.greaterThan(-1)
          store.dispatch(addLayer({ type: 'hexagonId', config: { dataId: dataset.id, isVisible: true, columns: { hex_id: 'h3' } } }))
          expect(store.getState().keplerGl.kepler.visState.layers.some(layer => layer.type === 'hexagonId')).to.equal(true)
        })
        bindPrecisePolygon('hexagonId', [23.4, 42.5], 0.1)
      } else {
        // Select a map area and bind it to Kepler's auto-created H3 layer.
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
          const layer = layers.find(layer => layer.type === 'hexagonId')
          expect(layer).to.not.equal(undefined)
          store.dispatch(setPolygonFilterLayer(layer, editor.features[0]))
        })
      }

      cy.get('[data-testid="filter-strip"]').should('contain.text', 'Map area')
      cy.contains('Could not apply map filters', { timeout: 30000 }).should('not.exist')
      cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
      cy.get('[data-testid="category-chart"]').should('contain.text', 'Beta').and('not.contain.text', 'Alpha')
    })
  }

  for (const [name, query, expected] of [['text GeoJSON bbox centers', GEOJSON_QUERY, '3'], ['native GEOMETRY', GEOMETRY_QUERY, '0']]) {
    it(`filters charts for ${name}`, () => {
      openChartReport('widgets-polygon-geometry', query, '6')
      bindPrecisePolygon('geojson')
      cy.get('[data-testid="filter-strip"]').should('contain.text', 'Map area')
      cy.contains('Could not apply map filters', { timeout: 30000 }).should('not.exist')
      cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', expected)
      if (expected === '3') cy.get('[data-testid="category-chart"]').should('contain.text', 'Alpha').and('not.contain.text', 'Beta')
    })
  }

  it('filters charts by GeoArrow point coordinates', () => {
    openChartReport('widgets-polygon-geoarrow', GEOARROW_POINT_QUERY, '6')

    // DuckDB retains the fixed-size list but does not mark it as geoarrow.point for Kepler.
    cy.window().then(win => {
      const store = reduxStore(win)
      const dataset = Object.values(store.getState().keplerGl.kepler.visState.datasets)[0]
      store.dispatch(addLayer({ type: 'point', config: { dataId: dataset.id, columnMode: 'geoarrow', isVisible: true, columns: { geoarrow: 'location' } } }))
      const layer = store.getState().keplerGl.kepler.visState.layers.find(layer => layer.type === 'point' && layer.config.columnMode === 'geoarrow')
      expect(layer?.config.columns.geoarrow.value).to.equal('location')
    })
    bindPrecisePolygon('point')
    cy.wait(3000)
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'Map area')
    cy.contains('Could not apply map filters', { timeout: 30000 }).should('not.exist')
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
    cy.get('[data-testid="category-chart"]').should('contain.text', 'Alpha').and('not.contain.text', 'Beta')
  })

  it('filters charts by GeoArrow arc endpoints', () => {
    openChartReport('widgets-polygon-geoarrow-arc', GEOARROW_ARC_QUERY, '8')

    cy.window().then(win => {
      const store = reduxStore(win)
      const dataset = Object.values(store.getState().keplerGl.kepler.visState.datasets)[0]
      store.dispatch(addLayer({ type: 'arc', config: { dataId: dataset.id, columnMode: 'geoarrow', isVisible: true, columns: { geoarrow0: 'arc_start', geoarrow1: 'arc_end' } } }))
      const layer = store.getState().keplerGl.kepler.visState.layers.find(layer => layer.type === 'arc' && layer.config.columnMode === 'geoarrow')
      expect(layer?.config.columns.geoarrow0.value).to.equal('arc_start')
    })
    bindPrecisePolygon('arc')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'Map area')
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')
    cy.get('[data-testid="category-chart"]').should('contain.text', 'Alpha').and('not.contain.text', 'Beta').and('not.contain.text', 'Cross')
  })
})
