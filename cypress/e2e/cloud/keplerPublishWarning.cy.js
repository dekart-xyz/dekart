/* global cy, describe, it, Cypress, expect */

function getReduxStoreFromWindow (win) {
  const rootNode = win.document.getElementById('root')
  const rootKey = Object.keys(rootNode).find(key => key.startsWith('__reactContainer$') || key.startsWith('__reactFiber$'))
  const reactRoot = rootNode[rootKey]
  const initialFiber = reactRoot.current || reactRoot.stateNode?.current || reactRoot
  const queue = [initialFiber]
  while (queue.length > 0) {
    const fiber = queue.shift()
    if (fiber?.memoizedProps?.store?.getState) return fiber.memoizedProps.store
    if (fiber?.child) queue.push(fiber.child)
    if (fiber?.sibling) queue.push(fiber.sibling)
  }
  throw new Error('Redux store not found')
}

describe('Kepler dataset publication warning', () => {
  it('offers issue reporting when a dataset cannot be published', () => {
    const email = `kepler-publish-warning-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'Upload File', { timeout: 30000 }).click()
    cy.get('input[type="file"]').selectFile('cypress/fixtures/sample.csv', { force: true })

    cy.window().then(win => {
      const store = getReduxStoreFromWindow(win)
      const originalSetTimeout = win.setTimeout.bind(win)
      const originalNow = win.Date.now.bind(win.Date)
      // Force the waiter's observed row count to differ, then advance its deadline.
      const unsubscribe = store.subscribe(() => {
        const datasets = store.getState().keplerGl.kepler?.visState.datasets || {}
        const dataset = Object.values(datasets).find(item => item.dataContainer.numRows() === 8276)
        if (dataset) {
          dataset.dataContainer.numRows = () => 0
          win.setTimeout = (callback, delay, ...args) => {
            if (delay === 25) {
              win.setTimeout = originalSetTimeout
              return originalSetTimeout(() => {
                win.Date.now = () => originalNow() + 120001
                callback()
              }, delay, ...args)
            }
            return originalSetTimeout(callback, delay, ...args)
          }
          unsubscribe()
        }
      })
    })

    cy.contains('button', /^Upload$/).click()
    cy.contains('.ant-message-warning', 'Kepler failed to publish the dataset.', { timeout: 30000 })
      .find('a').should($link => {
        expect($link.attr('target')).to.equal('_blank')
        const url = new URL($link.attr('href'))
        expect(url.pathname).to.equal('/dekart-xyz/dekart/issues/new')
        expect(url.searchParams.get('body')).to.include('Area: dataset publication')
        expect(url.searchParams.get('body')).to.include('Dekart version:')
        expect(url.searchParams.get('body')).not.to.include('Kepler failed to publish the dataset.')
        expect(url.searchParams.get('body')).not.to.include(email)
      })
    cy.get('.ant-message-error').should('not.exist')
  })

  it('offers issue reporting for an unexpected dataset download error', () => {
    const email = `dataset-download-error-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    let failedOnce = false
    cy.intercept('GET', '**/dataset-source/**', request => {
      if (failedOnce) return request.continue()
      failedOnce = true
      request.reply({
        statusCode: 500,
        headers: { 'content-type': 'text/plain' },
        body: 'Download failed'
      })
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.contains('button', 'Upload File', { timeout: 30000 }).click()
    cy.get('input[type="file"]').selectFile('cypress/fixtures/sample.csv', { force: true })
    cy.contains('button', /^Upload$/).click()
    cy.contains('.ant-message-error', '500 GET ', { timeout: 30000 }).should('be.visible')
    cy.get('[data-testid="error-message-text"]').should($text => {
      expect($text.text()).to.include('/dataset-source/')
      expect($text.css('text-overflow')).to.equal('ellipsis')
      expect($text[0].scrollWidth).to.be.greaterThan($text[0].clientWidth)
    })
    cy.contains('.ant-message-error', '500 GET ')
      .parents('.ant-message-notice-content')
      .should($toast => expect($toast[0].getBoundingClientRect().width).to.be.lessThan(650))
    cy.contains('.ant-message-error a', 'Report issue', { timeout: 30000 })
      .should('have.attr', 'href').then(href => {
        const body = new URL(href).searchParams.get('body')
        expect(body).to.include('Area: application error')
        expect(body).not.to.include('/dataset-source/')
      })
  })
})
