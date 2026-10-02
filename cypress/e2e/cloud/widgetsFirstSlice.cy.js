/* global cy, describe, it, Cypress, expect */

const dragHistogramRange = (from, to) => {
  cy.get('.interval-x .overlay').last().scrollIntoView().then(overlay => {
    const element = overlay[0]
    const svg = element.ownerSVGElement
    const bounds = svg.getBoundingClientRect()
    const scale = svg.scale('x')
    const view = element.ownerDocument.defaultView
    const clientY = element.getBoundingClientRect().top + 12
    cy.get('.interval-x .overlay').last().trigger('mousedown', { clientX: bounds.left + scale.apply(from), clientY, button: 0, view })
    cy.get('body').trigger('mousemove', { clientX: bounds.left + scale.apply(to), clientY, buttons: 1, view })
    cy.get('body').trigger('mouseup', { clientX: bounds.left + scale.apply(to), clientY, button: 0, view })
  })
}

describe('Widgets first production slice', () => {
  it('links Number and Category to one uploaded map and native filters', () => {
    cy.viewport(1280, 960)
    const email = `widgets-first-slice-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.get('[data-testid="widgets-tab"]').should('have.attr', 'aria-expanded', 'false').click()
    cy.contains('button', 'Add chart', { timeout: 30000 }).should('be.disabled')

    cy.contains('button', 'Upload File', { timeout: 30000 }).click()
    const rows = [
      '52.50,13.40,Alpha,10,2026-01-01,business-1',
      '52.51,13.41,Alpha,20,2026-01-02,business-1',
      '52.52,13.42,Beta,30,2026-01-03,business-2',
      '52.53,13.43,Beta,40,2026-01-04,business-3',
      '52.54,13.44,Gamma,,2026-01-05,business-4'
    ]
    cy.get('input[type="file"]').selectFile({
      contents: Cypress.Buffer.from(`latitude,longitude,category,capacity_kw,event_time,business_id\n${rows.join('\n')}\n`),
      fileName: 'widgets-first-slice.csv',
      mimeType: 'text/csv'
    }, { force: true })
    cy.contains('button', /^Upload$/).click()
    cy.contains('Ready', { timeout: 120000 }).should('be.visible')

    // Initial chart render after upload can take up to three minutes in CI.
    cy.get('[data-testid="widgets-tab"]', { timeout: 180000 }).should('have.attr', 'aria-expanded', 'true')
    cy.get('[data-testid="number-value"]', { timeout: 180000 }).should('have.text', '5')
    cy.get('[data-testid="category-chart"]').should('contain.text', 'Alpha').and('contain.text', 'Beta').and('contain.text', 'Gamma')
    cy.get('#kepler-gl__kepler canvas').should('be.visible')

    cy.get('[data-testid="map-settings-tab"]').click()
    cy.get('.layer__enable-config').first().click()
    cy.get('.channel-by-value-selector .item-selector').first().click()
    cy.contains('.list__item', 'category').click()
    cy.get('[data-testid="widgets-tab"]').click()
    cy.get('[data-testid="category-chart"] g[aria-label="bar"] rect').should(bars => {
      const colors = [...bars].map(bar => bar.getAttribute('fill'))
      expect(new Set(colors).size, 'Kepler category palette').to.be.greaterThan(1)
    })
    let originalColors
    cy.get('[data-testid="category-chart"] g[aria-label="bar"] rect').then(bars => { originalColors = [...bars].map(bar => bar.getAttribute('fill')) })
    cy.get('[data-testid="map-settings-tab"]').click()
    cy.get('.color-selector__selector').first().click()
    cy.get('.color-palette-outer').last().click()
    cy.get('[data-testid="widgets-tab"]').click()
    cy.get('[data-testid="category-chart"] g[aria-label="bar"] rect').should(bars => {
      expect([...bars].map(bar => bar.getAttribute('fill'))).not.to.deep.equal(originalColors)
    })

    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').first().click()
    cy.get('[data-testid="number-value"]').should('have.text', '2')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'category')
    cy.get('[data-testid="category-chart"] g[aria-label="bar"] rect').should(bars => {
      const opacities = [...bars].map(bar => bar.ownerDocument.defaultView.getComputedStyle(bar).opacity)
      expect(opacities.filter(value => value === '1')).to.have.length(1)
      expect(opacities).to.include('0.25')
    })

    // Definitions and the chart-owned selection share one report revision,
    // while the selection itself remains canonical Kepler map_config state.
    cy.get('button#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
    cy.reload()
    cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).should('have.attr', 'aria-expanded', 'true')
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '2')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'category')

    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').first().click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '5')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'No filters')

    // Histogram brushes persist raw field bounds rather than bin-start values.
    dragHistogramRange(25.5, 34.5)
    cy.get('[data-testid="number-value"]').should('have.text', '1')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'capacity kw')
    cy.get('button#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
    cy.reload()
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '1')
    cy.get('button[aria-label="Remove capacity kw filter"]').click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '5')

    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').eq(1).click()
    cy.get('[data-testid="number-value"]').should('have.text', '2')
    cy.contains('button', 'Clear all').click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '5')

    // Removing a Category chip must clear its local toggle before another bar is picked.
    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').first().click()
    cy.get('[data-testid="number-value"]').should('have.text', '2')
    cy.get('button[aria-label="Remove category filter"]').click()
    cy.get('[data-testid="number-value"]').should('have.text', '5')
    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').eq(1).click()
    cy.get('[data-testid="number-value"]').should('have.text', '2')
    cy.get('[data-testid="category-chart"] g[aria-label="bar"] rect').should(bars => {
      const opacities = [...bars].map(bar => bar.ownerDocument.defaultView.getComputedStyle(bar).opacity)
      expect(opacities.filter(value => value === '1')).to.have.length(1)
    })
    cy.contains('button', 'Clear all').click()

    cy.get('[data-testid="filter-strip"]').contains('button', 'Add filter').click()
    cy.get('.field-selector .item-selector').last().click()
    cy.contains('.field-selector_list-item', 'capacity_kw').click()
    cy.get('.kg-range-slider__input').last().clear().type('25{enter}')
    cy.get('[data-testid="widgets-tab"]').click()
    cy.get('[data-testid="number-value"]').should('have.text', '2')
    cy.get('[data-testid="category-chart"]').should('contain.text', 'Alpha').and('not.contain.text', 'Beta')
    cy.get('button#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
    cy.reload()
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '2')
    cy.get('.interval-x .selection').last().should(selection => {
      expect(selection[0].getBoundingClientRect().width, 'native range shown in histogram').to.be.greaterThan(0)
    })

    // A widget brush and a native Kepler filter on the same field intersect.
    // Disjoint ranges must show zero rows and no misleading range between them.
    dragHistogramRange(35.5, 39.5)
    cy.get('[data-testid="number-value"]').should('have.text', '0')
    cy.get('.interval-x .selection').last().should(selection => {
      expect(selection[0].getBoundingClientRect().width, 'empty range intersection').to.equal(0)
    })
    cy.get('button[aria-label="Reset capacity kw filters"]').click()
    cy.get('[data-testid="number-value"]').should('have.text', '5')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'No filters')

    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').first().click()
    cy.get('[data-testid="number-value"]').should('have.text', '2')
    cy.get('[data-testid="category-chart"]').closest('[data-testid="widget-item"]').find('button[aria-label="Chart actions"]').click()
    cy.contains('[role="menuitem"]', 'Delete chart').click()
    cy.get('[data-testid="category-chart"]').should('not.exist')
    cy.get('[data-testid="number-value"]').should('have.text', '5')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'No filters')

    // An explicit empty replacement clears SQLRooms state and stays empty after reload.
    cy.get('button[aria-label="Chart actions"]').first().click()
    cy.contains('[role="menuitem"]', 'Delete chart').click()
    cy.get('button[aria-label="Chart actions"]').first().click()
    cy.contains('[role="menuitem"]', 'Delete chart').click()
    cy.contains('Dashboard is empty').should('be.visible')
    cy.get('button#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
    cy.reload()
    cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).click()
    cy.contains('Dashboard is empty', { timeout: 120000 }).should('be.visible')
    cy.get('[data-testid="number-value"], [data-testid="category-chart"], [data-testid="histogram-chart"]').should('not.exist')
  })

  it('reads Kepler panel edits and clears the interactor when its chip is removed', () => {
    cy.viewport(1280, 960)
    const email = `widgets-panel-edit-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
    cy.enterQuery("SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE WHEN i < 2 THEN 'Alpha' WHEN i < 4 THEN 'Beta' ELSE 'Gamma' END AS category FROM range(5) t(i)")
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('[data-testid="widgets-tab"]').then(button => {
      if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
    })
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '5')
    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').first().click()
    cy.get('[data-testid="number-value"]').should('have.text', '2')
    cy.get('[data-testid="filter-strip"]').contains('button', 'category').click()
    cy.get('.multi-select-filter-panel .item-selector').last().click()
    cy.contains('.list__item', 'Beta').click()
    cy.get('[data-testid="widgets-tab"]').click()
    cy.get('[data-testid="number-value"]').should('have.text', '4')
    cy.get('[data-testid="category-chart"] g[aria-label="bar"] rect').should(bars => {
      const opacity = [...bars].map(bar => bar.ownerDocument.defaultView.getComputedStyle(bar).opacity)
      expect(opacity.filter(value => value === '1')).to.have.length(2)
      expect(opacity).to.include('0.25')
    })
    cy.get('button[aria-label="Remove category filter"]').click()
    cy.get('[data-testid="number-value"]').should('have.text', '5')
    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').last().click()
    cy.get('[data-testid="number-value"]').should('have.text', '1')
    cy.get('[data-testid="filter-strip"] button[title]').contains('category').should('have.attr', 'title').and('include', '["Gamma"]')
  })

})
