/* global cy, describe, it, Cypress, expect */

// Exercise the chart adapter with real report, Kepler, and Mosaic state.
function openReport () {
  cy.viewport(1280, 960)
  const email = `widgets-filter-sync-${Date.now()}@example.com`
  cy.setDevClaimsEmail(email)
  cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
    request.headers['X-Dekart-Claim-Email'] = email
  })
  cy.visit('/')
  cy.ensureTestWorkspace()
  cy.get('#dekart-create-report').click()
  cy.contains('button', 'DuckDB', { timeout: 30000 }).click()
  cy.enterQuery("SELECT 52.5 + i / 100 AS latitude, 13.4 + i / 100 AS longitude, CASE WHEN i < 2 THEN 'Alpha' WHEN i < 4 THEN 'Beta' ELSE 'Gamma' END AS category, (i + 1) * 10 AS score FROM range(5) t(i)")
  cy.get('#dekart-query-execute-button').should('be.enabled').click()
  cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
  cy.get('[data-testid="widgets-tab"]').then(button => {
    if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
  })
  cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '5')
}

function dragRange (from, to) {
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

// Publish a full brush gesture in one browser turn so the mode switch can precede deferred application.
function dragRangeImmediately (from, to, previousBrush) {
  cy.get('.interval-x .overlay').last().then(overlay => {
    const element = overlay[0]
    const svg = element.ownerSVGElement
    const bounds = svg.getBoundingClientRect()
    const scale = svg.scale('x')
    const view = element.ownerDocument.defaultView
    const y = element.getBoundingClientRect().top + 12
    element.dispatchEvent(new view.MouseEvent('mousedown', { bubbles: true, view, clientX: bounds.left + scale.apply(from), clientY: y, button: 0 }))
    view.document.body.dispatchEvent(new view.MouseEvent('mousemove', { bubbles: true, view, clientX: bounds.left + scale.apply(to), clientY: y, buttons: 1 }))
    view.document.body.dispatchEvent(new view.MouseEvent('mouseup', { bubbles: true, view, clientX: bounds.left + scale.apply(to), clientY: y, button: 0 }))
    const drawn = [...view.document.querySelectorAll('.interval-x .selection')].at(-1).getBoundingClientRect()
    expect(Math.abs(drawn.x - previousBrush.x), 'second brush moved').to.be.greaterThan(2)
  })
}

// Let browser frames run normally, but make presentation slow enough to change mode before its deferred command.
function delayFrames (view, frames = 300) {
  const request = view.requestAnimationFrame.bind(view)
  const cancel = view.cancelAnimationFrame.bind(view)
  const pending = new Map()
  let next = -1
  view.requestAnimationFrame = callback => {
    const token = next--
    let remaining = frames
    const tick = time => {
      if (--remaining === 0) { pending.delete(token); callback(time) } else pending.get(token).id = request(tick)
    }
    pending.set(token, { id: request(tick), callback })
    return token
  }
  view.cancelAnimationFrame = token => {
    cancel(pending.get(token)?.id || token)
    pending.delete(token)
  }
  return () => {
    view.requestAnimationFrame = request
    view.cancelAnimationFrame = cancel
    for (const { id, callback } of pending.values()) { cancel(id); request(callback) }
    pending.clear()
  }
}

describe('Widget filter sync', () => {
  it('keeps the final category after rapid interactions during deferred presentation', () => {
    openReport()
    let restoreFrames
    cy.window().then(view => { restoreFrames = delayFrames(view, 80) })
    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').first().click()
    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').last().click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '1')
    cy.get('[data-testid="filter-strip"] button[title]').contains('category').should('have.attr', 'title').and('include', '["Gamma"]')
    cy.then(() => restoreFrames())
  })

  it('restores the displayed histogram brush after its queued edit is rejected', () => {
    openReport()
    dragRange(15, 25)
    cy.get('[data-testid="number-value"]').should('have.text', '1')
    let firstBrush
    cy.get('.interval-x .selection').last().should(selection => {
      expect(selection[0].getBoundingClientRect().width).to.be.greaterThan(0)
    }).then(selection => { firstBrush = selection[0].getBoundingClientRect() })
    let firstRange
    cy.get('[data-testid="filter-strip"] button[title]').contains('score').invoke('attr', 'title').then(title => { firstRange = title })
    // A mode change invalidates a queued chart command; the Kepler range stays visible.
    let restoreFrames
    cy.window().then(view => { restoreFrames = delayFrames(view) })
    cy.then(() => dragRangeImmediately(35, 45, firstBrush))
    cy.contains('.ant-select', 'Editing').click()
    cy.contains('.ant-select-item-option-content', 'Viewing').click({ force: true })
    cy.then(() => restoreFrames())
    cy.get('[data-testid="number-value"]').should('have.text', '1')
    cy.then(() => cy.get('[data-testid="filter-strip"] button[title]').contains('score').should('have.attr', 'title').and('equal', firstRange))
    cy.get('.interval-x .selection').last().should(selection => {
      const brush = selection[0].getBoundingClientRect()
      expect(brush.x).to.be.closeTo(firstBrush.x, 2)
      expect(brush.width).to.be.closeTo(firstBrush.width, 2)
    })
  })
})
