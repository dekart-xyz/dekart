/* global cy, describe, it, expect */
import { addLayer, GEOJSON_QUERY, GEOMETRY_QUERY, GEOARROW_POINT_QUERY, GEOARROW_ARC_QUERY, reduxStore, openChartReport, bindPrecisePolygon } from './widgetsPolygonMapFilterHelpers'

describe('widgets with a polygon map filter for geometry', () => {
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
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'Map area')
    cy.contains('Could not apply map filters', { timeout: 30000 }).should('not.exist')
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '3')
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
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '3')
    cy.get('[data-testid="category-chart"]').should('contain.text', 'Alpha').and('not.contain.text', 'Beta').and('not.contain.text', 'Cross')
  })
})
