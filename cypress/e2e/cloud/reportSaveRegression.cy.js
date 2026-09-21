/* eslint-disable no-undef */
import { UpdateReportRequest } from 'dekart-proto/dekart_pb'

const LAYER_SELECTOR = '[data-testid="sortable-layer-item"], [data-testid="static-layer-item"]'

function getReduxStoreFromWindow (win) {
  const rootNode = win.document.getElementById('root')
  const reactRootKey = Object.keys(rootNode).find(key => key.startsWith('__reactContainer$') || key.startsWith('__reactFiber$'))
  const reactRoot = rootNode[reactRootKey]
  const initialFiber = reactRoot.current ? reactRoot.current : (reactRoot.stateNode?.current || reactRoot)
  const queue = [initialFiber]
  while (queue.length > 0) {
    const fiber = queue.shift()
    if (fiber?.memoizedProps?.store?.getState) {
      return fiber.memoizedProps.store
    }
    if (fiber?.child) queue.push(fiber.child)
    if (fiber?.sibling) queue.push(fiber.sibling)
  }
  throw new Error('Redux store not found')
}

function getStore () {
  return cy.window({ timeout: 60000 }).then((win) => getReduxStoreFromWindow(win))
}

function createUploadedReport () {
  const email = `report-save-${Date.now()}@example.com`
  cy.setDevClaimsEmail(email)
  cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
    request.headers['X-Dekart-Claim-Email'] = email
  })
  cy.visit('/')
  cy.ensureTestWorkspace()
  cy.get('button#dekart-create-report').click()
  cy.get('button:contains("Upload File")').click()
  cy.get('input[type="file"]').selectFile('cypress/fixtures/sample.csv', { force: true })
  cy.get('button:contains("Upload")').click()
  cy.get('div:contains("8,276 rows")', { timeout: 60000 }).should('be.visible')
  cy.get(LAYER_SELECTOR, { timeout: 120000 }).should('have.length', 1)
  cy.location('pathname', { timeout: 60000 })
    .should('match', /^\/reports\/[a-f0-9-]+\/source$/)
    .as('createdReportPath')
}

function markLocalMapChanged () {
  getStore().then((store) => {
    store.dispatch({
      type: '@@kepler.gl/TOGGLE_SIDE_PANEL',
      payload: 'layer'
    })
    store.dispatch({
      type: 'setLastMapConfigChanged'
    })
  })
}

function sendUpdateReportOutsideAppSave (store, mapConfig, widgetsConfig) {
  const state = store.getState()
  const request = new UpdateReportRequest()
  request.setReportId(state.report.id)
  request.setMapConfig(mapConfig)
  request.setTitle(state.report.title)
  request.setExpectedVersionId(state.report.versionId)
  if (widgetsConfig !== undefined) request.setWidgetsConfig(widgetsConfig)

  const metadata = new window.Headers()
  if (state.token?.access_token) {
    metadata.append('Authorization', `Bearer ${state.token.access_token}`)
  }
  if (state.user?.claimEmailCookie) {
    metadata.append('X-Dekart-Claim-Email', state.user.claimEmailCookie)
  }
  metadata.append('X-Dekart-Report-Id', state.report.id)

  const requestBytes = request.serializeBinary()
  const body = new Uint8Array(requestBytes.length + 5)
  const view = new DataView(body.buffer)
  view.setUint8(0, 0)
  view.setUint32(1, requestBytes.length)
  body.set(requestBytes, 5)

  metadata.append('Content-Type', 'application/grpc-web+proto')
  metadata.append('X-Grpc-Web', '1')

  const host = Cypress.env('DEKART_E2E_API_URL')
  return cy.window().then((win) => win.fetch(`${host}/Dekart/UpdateReport?cypress_remote_update=1`, {
    method: 'POST',
    headers: metadata,
    body
  }))
}

function updateReportMapConfigOutsideAppSave (store, mapConfig) {
  return sendUpdateReportOutsideAppSave(store, mapConfig).then((response) => {
    expect(response.ok).to.equal(true)
    // A rejected save answers with HTTP 200 and a trailers-only grpc-status header.
    const grpcStatus = response.headers.get('grpc-status')
    expect(grpcStatus === null || grpcStatus === '0', `remote update grpc-status ${grpcStatus}`).to.equal(true)
  })
}

// waitForIdleSave waits until no save is in flight and nothing is left unsaved,
// which the save button shows with the plain cloud icon.
function waitForIdleSave () {
  cy.get('button#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
}

function clickWriteReadme () {
  cy.get('body').then(($body) => {
    if ($body.find('button:contains("Write README")').length === 0) {
      cy.get('button.ant-tabs-nav-add:visible').click()
    }
  })
  cy.contains('button', 'Write README').click()
}

describe('cloud report save regression', () => {
  beforeEach(() => {
    cy.resetCloudTestDatabase()
  })

  it('rejects a browser widget write bound to an unknown report dataset', () => {
    createUploadedReport()
    getStore().then((store) => {
      const state = store.getState()
      const widgetsConfig = JSON.stringify({
        version: 1,
        widgets: [{ id: 'unknown-binding', dataId: '11111111-1111-4111-8111-111111111111', type: 'number', title: 'Rows', settings: { operation: 'count' } }]
      })
      sendUpdateReportOutsideAppSave(store, state.report.mapConfig, widgetsConfig).then((response) => {
        expect(response.ok).to.equal(true)
        expect(response.headers.get('grpc-status')).to.equal('3')
        expect(decodeURIComponent(response.headers.get('grpc-message'))).to.contain('widgets_config.widgets[0].dataId')
      })
    })
  })

  it('does not show map conflict when own save stream arrives before save response', () => {
    createUploadedReport()

    cy.intercept('POST', '**/Dekart/UpdateReport', (req) => {
      req.continue((res) => {
        res.setDelay(1500)
      })
    }).as('updateReport')

    markLocalMapChanged()
    cy.get('button#dekart-save-button').click()
    cy.get('button#dekart-save-button').should('be.disabled')
    cy.contains('Map changed', { timeout: 3000 }).should('not.exist')
    cy.wait('@updateReport')
    cy.get('button#dekart-save-button', { timeout: 60000 }).should('not.be.disabled')
    cy.contains('Map changed').should('not.exist')
    cy.contains('Reload').should('not.exist')
  })

  it('does not show map conflict for its own save after a readme write rotated the report version', () => {
    cy.intercept('POST', '**/Dekart/UpdateReport').as('autoSave')
    createUploadedReport()
    cy.wait('@autoSave', { timeout: 60000 })
    waitForIdleSave()
    // AddReadme rotates the report version without changing the map.
    clickWriteReadme()
    cy.contains('.ant-tabs-tab', 'Readme', { timeout: 30000 }).should('be.visible')
    waitForIdleSave()

    cy.intercept('POST', '**/Dekart/UpdateReport', (req) => {
      req.continue((res) => {
        res.setDelay(4000)
      })
    }).as('updateReport')

    markLocalMapChanged()
    cy.get('button#dekart-save-button').click()
    cy.get('button#dekart-save-button').should('be.disabled')
    // A map edit while the save is in flight must not turn the save echo into a remote conflict.
    const visibilityToggle = '.layer__visibility-toggle .panel--header__action__component'
    cy.openLayerPanel()
    cy.get(visibilityToggle).first().trigger('click')
    cy.get(visibilityToggle).first().should('have.attr', 'data-for').and('include', 'tooltip.showLayer')
    cy.wait('@updateReport')
    cy.get('button#dekart-save-button', { timeout: 60000 }).should('not.be.disabled')
    cy.contains('Map changed').should('not.exist')
    cy.contains('Reload').should('not.exist')
  })

  it('accepts a remote map update after automatic panel opening without user edits', () => {
    cy.intercept('POST', '**/Dekart/UpdateReport*', (req) => {
      if (new URL(req.url).searchParams.has('cypress_remote_update')) {
        req.continue()
      } else {
        req.reply({ statusCode: 503 })
      }
    }).as('blockedAutoSave')
    createUploadedReport()
    cy.wait('@blockedAutoSave', { timeout: 60000 })
    cy.contains('.ant-message-error', 'The server is currently unavailable.').should('be.visible')
    cy.contains('.ant-message-error button', 'Reload Page').should('be.visible')
    cy.get(LAYER_SELECTOR).should('have.length', 1)

    getStore().then((store) => {
      const state = store.getState()
      // Every save is blocked here, so there is no persisted config to reuse, and the
      // test image ships a minimal node_modules without Kepler's schema package.
      // shouldUpdateMapConfig ignores viewport, so the empty layer list is what drives
      // the update; the zoom bump only keeps the config distinguishable while reading.
      const remoteMapConfig = {
        version: 'v1',
        config: {
          visState: { layers: [] },
          mapState: { ...state.keplerGl.kepler.mapState, zoom: (state.keplerGl.kepler.mapState.zoom || 0) + 1 }
        }
      }
      return updateReportMapConfigOutsideAppSave(store, JSON.stringify(remoteMapConfig))
    })

    cy.get(LAYER_SELECTOR, { timeout: 5000 }).should('not.exist')
    cy.contains('Map changed').should('not.exist')
  })

  it('keeps README removed after immediate save and report reload', () => {
    createUploadedReport()

    clickWriteReadme()
    cy.contains('.ant-tabs-tab', 'Readme', { timeout: 20000 }).should('be.visible')
    cy.get('button#dekart-save-button').click()
    cy.get('button#dekart-save-button', { timeout: 60000 }).should('not.be.disabled')

    cy.get('.ant-tabs-tab-remove').first().click()
    cy.contains('.ant-modal-confirm-title', 'Remove readme from report?').should('be.visible')
    cy.contains('.ant-modal-confirm-btns button', 'Yes').click()
    cy.get('button#dekart-save-button').click()
    cy.get('button#dekart-save-button', { timeout: 60000 }).should('not.be.disabled')

    cy.contains('.ant-tabs-tab', 'Readme').should('not.exist')
    cy.get('@createdReportPath').then((reportPath) => {
      cy.visit(reportPath)
    })
    cy.get('body', { timeout: 120000 }).should($body => {
      expect($body.find('button#dekart-save-button, button:contains("Edit")').length).to.be.greaterThan(0)
    }).then(($body) => {
      if ($body.find('button#dekart-save-button').length === 0) {
        cy.contains('button', 'Edit').click()
      }
    })
    cy.get('button#dekart-save-button', { timeout: 60000 }).should('be.visible')
    cy.contains('.ant-tabs-tab', 'Readme').should('not.exist')
  })
})
