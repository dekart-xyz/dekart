/* eslint-disable no-undef */
import { UpdateReportRequest } from 'dekart-proto/dekart_pb'

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
  cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN_INFO')
  cy.visit('/')
  cy.ensureTestWorkspace()
  cy.get('button#dekart-create-report').click()
  cy.get('button:contains("Upload File")').click()
  cy.get('input[type="file"]').selectFile('cypress/fixtures/sample.csv', { force: true })
  cy.get('button:contains("Upload")').click()
  cy.get('div:contains("8,276 rows")', { timeout: 60000 }).should('be.visible')
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

function updateReportMapConfigOutsideAppSave (store, mapConfig) {
  const state = store.getState()
  const request = new UpdateReportRequest()
  request.setReportId(state.report.id)
  request.setMapConfig(mapConfig)
  request.setTitle(state.report.title)

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

  const host = Cypress.env('CYPRESS_CI') ? Cypress.config('baseUrl') : 'http://localhost:8080'
  return cy.window().then((win) => win.fetch(`${host}/Dekart/UpdateReport`, {
    method: 'POST',
    headers: metadata,
    body
  })).then((response) => {
    expect(response.ok).to.equal(true)
  })
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

  it('shows map conflict when a remote map update arrives with local unsaved map edits', () => {
    createUploadedReport()

    markLocalMapChanged()
    getStore().then((store) => {
      const state = store.getState()
      const remoteMapConfig = JSON.parse(state.report.mapConfig)
      remoteMapConfig.config.mapState = {
        ...remoteMapConfig.config.mapState,
        zoom: (remoteMapConfig.config.mapState.zoom || 0) + 1
      }
      return updateReportMapConfigOutsideAppSave(store, JSON.stringify(remoteMapConfig))
    })

    cy.contains('Map changed', { timeout: 5000 }).should('be.visible')
    cy.contains('Reload').should('be.visible')
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
    cy.get('body', { timeout: 60000 }).then(($body) => {
      if ($body.find('button#dekart-save-button').length === 0) {
        cy.contains('button', 'Edit').click()
      }
    })
    cy.get('button#dekart-save-button', { timeout: 60000 }).should('be.visible')
    cy.contains('.ant-tabs-tab', 'Readme').should('not.exist')
  })
})
