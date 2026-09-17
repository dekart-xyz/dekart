/* global cy, describe, it, Cypress */

const sizes = [100000, 800000, 1000000]

function enterSQL (rows) {
  const sql = `SELECT 51 + (i % 1000) / 10000.0 AS latitude, 8 + (i % 1000) / 10000.0 AS longitude, CASE i % 4 WHEN 0 THEN 'Solar' WHEN 1 THEN 'Wind' WHEN 2 THEN 'Hydro' ELSE 'Storage' END AS category, 'duplicate-business-id' AS business_id FROM range(${rows}) t(i)`
  cy.get('.ace_editor:visible textarea').click({ force: true }).type('{meta+a}{backspace}', { force: true })
  cy.get('.ace_editor:visible textarea').then(textarea => {
    const view = textarea[0].ownerDocument.defaultView
    const clipboardData = new view.DataTransfer()
    clipboardData.setData('text/plain', sql)
    textarea[0].dispatchEvent(new view.ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }))
  })
}

function percentile (values, value) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)]
}

const formatted = value => new Intl.NumberFormat('en-US').format(value)

function measureInteraction (action, expectedValue, samples) {
  let started
  let feedback
  let feedbackPromise
  cy.get('aside[aria-label="Report charts"]', { timeout: 120000 }).should('have.attr', 'aria-busy', 'false').then(pane => {
    const element = pane[0]
    const view = element.ownerDocument.defaultView
    started = view.performance.now()
    feedbackPromise = new Cypress.Promise(resolve => {
      const observer = new view.MutationObserver(() => {
        if (element.getAttribute('aria-busy') !== 'true') return
        observer.disconnect()
        resolve(view.performance.now() - started)
      })
      observer.observe(element, { attributes: true, attributeFilter: ['aria-busy'] })
    })
  })
  action()
  cy.then(() => feedbackPromise).then(duration => { feedback = duration })
  cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', formatted(expectedValue))
  cy.get('aside[aria-label="Report charts"]', { timeout: 120000 }).should('have.attr', 'aria-busy', 'false').then(() => {
    cy.window().then(view => {
      samples.push({ feedback, settled: view.performance.now() - started })
    })
  })
}

describe('Widgets staged performance benchmark', { scrollBehavior: 'center' }, () => {
  it('measures Number and Category interactions at production target sizes', () => {
    const email = `widgets-performance-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'DuckDB', { timeout: 30000 }).click()

    sizes.forEach((rows, sizeIndex) => {
      enterSQL(rows)
      let loadStarted
      cy.window().then(view => {
        loadStarted = view.performance.now()
        view.__widgetLongTasks = []
        if (!view.__widgetLongTaskObserver && 'PerformanceObserver' in view) {
          view.__widgetLongTaskObserver = new view.PerformanceObserver(list => {
            view.__widgetLongTasks.push(...list.getEntries().map(entry => entry.duration))
          })
          try { view.__widgetLongTaskObserver.observe({ type: 'longtask', buffered: true }) } catch (_) {}
        }
      })
      cy.get('#dekart-query-execute-button').should('be.enabled').click()
      cy.get('#dekart-query-status-message', { timeout: 180000 }).should('contain', 'Ready')
      cy.get('[data-testid="widgets-tab"]', { timeout: 180000 }).then(button => {
        if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
      })
      cy.get('[data-testid="number-value"]', { timeout: 180000 }).should('have.text', formatted(rows))
      cy.get('[data-testid="category-chart"]', { timeout: 180000 }).should('contain.text', 'Solar')

      const samples = []
      let initialLoadMs
      let initialLongestTaskMs
      cy.window().then(view => {
        initialLoadMs = view.performance.now() - loadStarted
        initialLongestTaskMs = Math.max(0, ...(view.__widgetLongTasks || []))
        view.__widgetLongTasks = []
      })
      for (let iteration = 0; iteration < 15; iteration++) {
        measureInteraction(
          () => cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').first().click(),
          rows / 4,
          samples
        )
        measureInteraction(
          () => cy.contains('button', 'Clear all').click(),
          rows,
          samples
        )
      }

      cy.window().then(view => {
        const settled = samples.map(sample => sample.settled)
        const feedback = samples.map(sample => sample.feedback)
        const longTasks = view.__widgetLongTasks || []
        const result = {
          rows,
          interactionCount: samples.length,
          initialLoadMs: Math.round(initialLoadMs),
          initialLongestTaskMs: Math.round(initialLongestTaskMs),
          firstFeedbackP50Ms: Math.round(percentile(feedback, 0.5)),
          firstFeedbackP95Ms: Math.round(percentile(feedback, 0.95)),
          settledP50Ms: Math.round(percentile(settled, 0.5)),
          settledP95Ms: Math.round(percentile(settled, 0.95)),
          longestTaskMs: Math.round(Math.max(0, ...longTasks)),
          tasksOver50ms: longTasks.filter(duration => duration > 50).length,
          usedJSHeapBytes: view.performance.memory?.usedJSHeapSize ?? null,
          settledSamplesMs: settled.map(Math.round),
          feedbackSamplesMs: feedback.map(Math.round),
          completionSignal: 'chart value plus deck.gl onAfterRender acknowledgement'
        }
        cy.task('performanceResult', `WIDGETS_BENCHMARK ${JSON.stringify(result)}`)
      })

      if (sizeIndex < sizes.length - 1) {
        cy.contains('button', 'Clear all').should('not.exist')
        cy.wait(250)
      }
    })
  })
})
