/* global cy, describe, it, expect */
import { addLayer, setPolygonFilterLayer, SIX_ROW_QUERY, H3_QUERY, DECIMAL_H3_QUERY, reduxStore, openChartReport, bindPrecisePolygon } from './widgetsPolygonMapFilterHelpers'

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
      cy.get('button#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
      cy.reload()
      cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '3')
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
})
