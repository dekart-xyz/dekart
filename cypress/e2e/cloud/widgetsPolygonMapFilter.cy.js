/* global cy, describe, it, Cypress */
import { setPolygonFilterLayer } from '@kepler.gl/actions'

const SIX_ROW_QUERY = "SELECT CASE WHEN i < 3 THEN 52.5 ELSE 42.5 END + i / 100 AS latitude, CASE WHEN i < 3 THEN 13.4 ELSE 23.4 END + i / 100 AS longitude, CASE WHEN i < 3 THEN 'Alpha' ELSE 'Beta' END AS category FROM range(6) t(i)"

function reduxStore (win) {
  const root = win.document.getElementById('root')._reactRootContainer
  return root.current.child.memoizedProps.store
}

// Far-apart clusters keep the screen-relative rectangle on one group after auto-fit.
describe('widgets with a polygon map filter', () => {
  for (const layerLabel of [null, 'Named points']) {
    it(`filters charts for a ${layerLabel || 'default'} point layer`, () => {
      cy.viewport(1280, 960)
      const email = `widgets-polygon-filter-${Date.now()}@example.com`
      cy.setDevClaimsEmail(email)
      cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
        request.headers['X-Dekart-Claim-Email'] = email
      })
      cy.visit('/')
      cy.ensureTestWorkspace()
      cy.get('#dekart-create-report').click()
      cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
      cy.enterQuery(SIX_ROW_QUERY)
      cy.get('#dekart-query-execute-button').should('be.enabled').click()
      cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
      cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).then(button => {
        if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
      })
      cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '6')
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
})
