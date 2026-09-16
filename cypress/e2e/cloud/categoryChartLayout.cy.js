/* global cy, describe, it, Cypress, expect */

// Many long categories must remain legible in a narrow chart card.
describe('Category chart rows', () => {
  it('separates long labels and keeps click-to-filter working', () => {
    cy.viewport(1280, 960)
    const email = `category-chart-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    // Upload REST requests need the same local dev identity as gRPC requests.
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => { request.headers['X-Dekart-Claim-Email'] = email })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.get('[data-testid="widgets-tab"]').should('have.attr', 'aria-expanded', 'false')
    cy.get('[data-testid="widgets-tab"]').click()
    cy.get('aside[aria-label="Report charts"]').within(() => {
      cy.contains('h2', 'Charts').should('be.visible')
      cy.contains('button', 'Add chart').should('be.visible').and('be.disabled')
      cy.contains('Load data to add charts').should('not.exist')
      cy.contains('Open data').should('not.exist')
    })
    cy.get('[role="tablist"][aria-label="Control pane"] [role="tab"]').then(tabs => {
      expect(tabs[0].textContent).to.contain('Charts')
      expect(tabs[1].textContent).to.equal('Map layers')
    })
    cy.contains('button', 'Upload File', { timeout: 30000 }).click()
    const categories = ['THEFT', 'BATTERY', 'CRIMINAL DAMAGE', 'NARCOTICS', 'ASSAULT', 'OTHER OFFENSE', 'BURGLARY', 'MOTOR VEHICLE THEFT', 'DECEPTIVE PRACTICE', 'ROBBERY', 'CRIMINAL TRESPASS', 'WEAPONS VIOLATION', 'OFFENSE INVOLVING CHILDREN', 'PROSTITUTION', 'PUBLIC PEACE VIOLATION', 'SEX OFFENSE', 'INTERFERENCE WITH PUBLIC OFFICER', 'LIQUOR LAW VIOLATION', 'CRIM SEXUAL ASSAULT', 'CRIMINAL SEXUAL ASSAULT']
    const rows = categories.flatMap((category, index) => Array.from({ length: 20 - index }, () => `52,13,${category},${index * 3}`))
    cy.get('input[type="file"]').selectFile({ contents: Cypress.Buffer.from(`latitude,longitude,primary_type,district\n${rows.join('\n')}\n`), fileName: 'category-layout.csv', mimeType: 'text/csv' }, { force: true })
    cy.contains('button', /^Upload$/).click()
    cy.contains('Ready', { timeout: 120000 }).should('be.visible')
    cy.get('[data-testid="widgets-tab"]', { timeout: 180000 }).should('have.attr', 'aria-expanded', 'true')
    cy.get('svg text', { timeout: 180000 }).should('contain', 'CRIMINAL DAMAGE')
    cy.get('[data-testid="map-settings-tab"]').click()
    cy.get('.layer__enable-config').first().click()
    cy.get('.channel-by-value-selector .item-selector').first().click()
    cy.contains('.list__item', 'primary_type').click()
    cy.get('[data-testid="widgets-tab"]').click()
    cy.get('[data-testid="category-chart"] g[aria-label="bar"] rect').should(bars => {
      const colors = [...bars].map(bar => bar.getAttribute('fill'))
      expect(new Set(colors).size, 'Kepler category palette').to.be.greaterThan(1)
      expect(colors).not.to.include('#36b99a')
    })
    cy.get('svg text').should(elements => {
      const labels = [...elements].filter(element => categories.includes(element.querySelector('title')?.textContent))
      expect(labels.length).to.be.greaterThan(10)
      const boxes = labels.map(element => element.getBoundingClientRect()).sort((a, b) => a.top - b.top)
      for (let index = 1; index < boxes.length; index++) expect(boxes[index].top - boxes[index - 1].bottom, 'space between category labels').to.be.at.least(8)
    })
    cy.contains('button', 'Show 17 more').click()
    cy.get('[data-testid="category-chart"]').scrollTo('bottom')
    cy.contains('svg text', /^CRIMINAL SEXUAL ASSAULT/).should('be.visible')
    cy.get('[data-testid="category-chart"]').scrollTo('top')
    cy.contains('button', 'Show less').click()
    // Row count is inferred alongside Category and Histogram without opening the builder.
    cy.get('[data-testid="number-value"]').should('have.text', '210')
    cy.get('[data-testid="category-chart"]').scrollIntoView()
    const loadingStates = []
    let loadingObserver
    cy.get('aside[aria-label="Report charts"]').then(pane => {
      const element = pane[0]
      loadingObserver = new element.ownerDocument.defaultView.MutationObserver(() => {
        if (element.getAttribute('aria-busy') === 'true') loadingStates.push({
          line: element.querySelector('[data-testid="chart-calculation-line"]')?.getAttribute('aria-hidden') === 'false',
          value: element.querySelector('[data-testid="number-value"]')?.textContent
        })
      })
      loadingObserver.observe(element, { attributes: true, childList: true, subtree: true })
    })
    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').first().click()
    cy.get('[data-testid="number-value"]').should('have.text', '20')
    cy.get('[data-testid="category-chart"] g[aria-label="bar"] rect').should(bars => {
      const opacities = [...bars].map(bar => bar.ownerDocument.defaultView.getComputedStyle(bar).opacity)
      expect(opacities.filter(value => value === '1')).to.have.length(1)
      expect(opacities).to.include('0.25')
    })
    cy.get('aside[aria-label="Report charts"]').should('have.attr', 'aria-busy', 'false').then(() => {
      loadingObserver.disconnect()
      expect(loadingStates.some(state => state.line && state.value === '210'), 'previous value stays visible under the loading line').to.equal(true)
    })
    cy.get('[data-testid="chart-calculation-line"]').should('not.be.visible')
    cy.get('[data-testid="filter-strip"]').should('contain', 'primary type').and('contain', 'Clear all')
    cy.get('[data-testid="map-settings-tab"]').click()
    cy.get('[data-testid="filter-strip"]').should('not.be.visible')
    cy.get('[data-testid="widgets-tab"]').click()
    cy.get('[data-testid="filter-strip"]').should('be.visible').and('contain', 'primary type')
    cy.contains('button', 'Clear all').click()
    cy.get('[data-testid="number-value"]').should('have.text', '210')
    cy.get('[data-testid="filter-strip"]').should('contain', 'No filters')
    cy.get('[data-testid="category-chart"] g[aria-label="bar"] rect').should(bars => {
      expect([...bars].every(bar => bar.ownerDocument.defaultView.getComputedStyle(bar).opacity === '1')).to.equal(true)
    })
    cy.get('[data-testid="filter-strip"]').contains('button', 'Add filter').click()
    cy.get('[data-testid="map-settings-tab"]').should('have.attr', 'aria-selected', 'true')
    cy.get('[data-testid="widgets-tab"]').click()
    cy.get('button[aria-label="Chart actions"]').last().focus().click()
    cy.contains('[role="menuitem"]', 'Edit chart').click()
    cy.get('[data-testid="widget-settings"]').should('be.visible')
    cy.contains('button', 'Back to charts').click()
    cy.get('g[aria-label="rect"]', { timeout: 30000 }).should('exist')
    cy.get('[data-testid="widgets-tab"]').should('contain', '3')
    cy.get('#dekart-save-button').click()
    cy.get('#dekart-save-button [aria-label="cloud"]', { timeout: 20000 }).should('be.visible')
    cy.intercept({ method: 'GET', url: '**/duckdb-eh.wasm', times: 1 }, request => request.continue(response => response.setDelay(3000)))
    // Hold the initial data response so the saved chart placeholders can be inspected.
    cy.intercept({ method: 'GET', url: '**/api/v1/dataset-source/**', times: 1 }, request => {
      request.headers['X-Dekart-Claim-Email'] = email
      request.continue(response => response.setDelay(3000))
    })
    cy.reload()
    cy.get('[data-testid="widgets-tab"]', { timeout: 2000 }).should('have.attr', 'aria-expanded', 'true').and('contain', '3')
    cy.get('[data-testid="chart-stub"]', { timeout: 30000 }).should('have.length', 3).first().should('be.visible')
    cy.get('aside[aria-label="Report charts"]').should('not.contain.text', 'Loading')
    cy.get('[data-testid="chart-stub"]', { timeout: 180000 }).should('not.exist')
    cy.get('[data-testid="widgets-tab"]', { timeout: 30000 }).should('have.attr', 'aria-expanded', 'true').and('contain', '3')
    cy.url().then(url => cy.visit(url.replace('/source', '')))
    cy.get('[data-testid="widgets-tab"]', { timeout: 30000 }).should('have.attr', 'aria-expanded', 'true').and('contain', '3')
    cy.get('[data-testid="map-settings-tab"]').should('be.visible').click()
    cy.contains('button', 'Add Layer', { timeout: 30000 }).should('be.visible')
    cy.get('[data-testid="widgets-tab"]').click()
    cy.contains('button', 'Add chart', { timeout: 180000 }).should('not.be.disabled').click()
    cy.contains('button', /^Number/).click()
    cy.contains('button', /^Create$/).click()
    cy.get('[data-testid="widgets-tab"]').should('contain', '4')
    cy.get('[data-testid="number-value"]').should('have.length', 2)
    cy.reload()
    cy.get('[data-testid="widgets-tab"]', { timeout: 30000 }).should('have.attr', 'aria-expanded', 'true').and('contain', '3')
    cy.get('[data-testid="number-value"]', { timeout: 180000 }).should('have.length', 1)
    // Removing the last chart collapses the pane, but exploration does not change saved charts.
    for (let index = 0; index < 3; index++) {
      cy.get('button[aria-label="Chart actions"]').first().focus().click()
      cy.contains('[role="menuitem"]', 'Delete chart').click()
    }
    cy.get('[data-testid="widgets-tab"]').should('have.attr', 'aria-expanded', 'false')
    cy.get('[data-testid="widgets-tab"]').click()
    cy.contains('button', 'Add chart').should('be.visible')
    cy.reload()
    cy.get('[data-testid="widgets-tab"]', { timeout: 30000 }).should('have.attr', 'aria-expanded', 'true').and('contain', '3')
  })
})
