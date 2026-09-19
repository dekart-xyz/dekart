/* eslint-disable no-undef */

const LAYER_SELECTOR = '[data-testid="sortable-layer-item"], [data-testid="static-layer-item"]'
const apiBase = `${Cypress.env('DEKART_E2E_API_URL')}/api/v1`

// uploadActiveDataset completes the visible local file-upload flow for the selected dataset.
function uploadActiveDataset (fixture) {
  cy.intercept('POST', '**/Dekart/CreateFile').as('createFile')
  cy.intercept('POST', '**/api/v1/file/*/upload-sessions').as('startUploadSession')
  cy.intercept('PUT', '**/api/v1/file/*/upload-sessions/*/parts/*').as('uploadPart')
  cy.intercept('POST', '**/api/v1/file/*/upload-sessions/*/complete').as('completeUploadSession')
  cy.contains('button', 'Upload File', { timeout: 20000 }).should('be.visible').click()
  cy.wait('@createFile', { timeout: 60000 })
  cy.get('input[type="file"]', { timeout: 20000 }).selectFile(fixture, { force: true })
  cy.contains('button', 'Upload').click()
  cy.wait('@startUploadSession', { timeout: 60000 })
  cy.wait('@uploadPart', { timeout: 60000 })
  cy.wait('@completeUploadSession', { timeout: 120000 })
  cy.contains('Ready', { timeout: 120000 }).should('be.visible')
}

// getDeviceToken authorizes MCP calls through the user-visible device flow.
function getDeviceToken () {
  return cy.request('POST', `${apiBase}/device`, {
    device_name: 'cypress-local-map-config-auto-layers'
  }).then((startResponse) => {
    const deviceId = startResponse.body.device_id
    const authUrl = startResponse.body.auth_url
    expect(deviceId, 'device_id').to.be.a('string').and.not.eq('')
    expect(authUrl, 'auth_url').to.be.a('string').and.include('/device/authorize')

    cy.visit(authUrl)
    cy.contains('button', 'Authorize', { timeout: 20000 }).click()
    cy.contains('Device authorized', { timeout: 20000 }).should('be.visible')

    return cy.request('POST', `${apiBase}/device/token`, { device_id: deviceId }).then((tokenResponse) => {
      expect(tokenResponse.body.status, 'device token status').to.eq('authorized')
      expect(tokenResponse.body.token, 'device token').to.be.a('string').and.not.eq('')
      return tokenResponse.body.token
    })
  })
}

// mcpCall invokes one authenticated MCP tool and returns its result payload.
function mcpCall (token, name, args = {}) {
  return cy.request({
    method: 'POST',
    url: `${apiBase}/mcp/call`,
    headers: { Authorization: `Bearer ${token}` },
    body: { name, arguments: args }
  }).then((response) => {
    expect(response.body).to.have.property('result')
    return response.body.result
  })
}

describe('saved map config layer ownership', () => {
  it('auto-creates a layer only for the newly added dataset', () => {
    getDeviceToken().then((token) => {
      cy.visit('/')
      cy.get('body', { timeout: 20000 }).then(($body) => {
        // The local lane may start before or after its one-time file-upload setup.
        if ($body.text().includes('Ready to connect')) {
          cy.contains('button', 'Use file upload').click()
        } else {
          cy.get('button#dekart-create-report').click()
        }
      })

      uploadActiveDataset('cypress/fixtures/sample.csv')
      cy.openLayerPanel()
      cy.get(LAYER_SELECTOR, { timeout: 60000 }).should('have.length', 1)
      cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).then(button => {
        if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
      })
      cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '8,276')
      cy.intercept('POST', '**/Dekart/UpdateReport').as('saveReport')
      cy.get('button#dekart-save-button', { timeout: 20000 }).should('not.be.disabled').click()
      cy.wait('@saveReport', { timeout: 60000 })

      cy.location('pathname').should('match', /\/reports\/[^/]+\/source$/).then((pathname) => {
        const reportId = pathname.match(/\/reports\/([^/]+)\/source$/)[1]
        let initialDatasetIds = []
        mcpCall(token, 'get_report_properties', { report_id: reportId }).then((properties) => {
          initialDatasetIds = (properties.datasets || properties.datasetsList || []).map(dataset => dataset.id)
          const mapConfig = JSON.parse(properties.report.mapConfig || properties.report.map_config)
          mapConfig.config.visState.layers = []
          return mcpCall(token, 'update_report_map_config', {
            report_id: reportId,
            map_config: JSON.stringify(mapConfig)
          })
        })

        cy.visit(`/reports/${reportId}/source`)
        cy.openLayerPanel()
        cy.get(LAYER_SELECTOR, { timeout: 60000 }).should('not.exist')
        cy.get('button.ant-tabs-nav-add:visible').click()
        uploadActiveDataset('cypress/fixtures/sample.csv')
        cy.get(LAYER_SELECTOR, { timeout: 60000 }).should('have.length', 1)
        cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).then(button => {
          if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
        })
        cy.get('[data-testid="dataset-widgets"]', { timeout: 120000 }).should('have.length', 2)
        cy.get('[data-testid="dataset-widgets"]').eq(1).find('[data-testid="number-value"]').should('have.text', '8,276')
        mcpCall(token, 'get_report_properties', { report_id: reportId }).then((properties) => {
          const addedDataset = (properties.datasets || properties.datasetsList || []).find(dataset => !initialDatasetIds.includes(dataset.id))
          expect(addedDataset?.id, 'new dataset id').to.be.a('string')
          expect(addedDataset.id, 'new dataset id').not.to.equal('')
          return mcpCall(token, 'remove_dataset', { dataset_id: addedDataset.id })
        }).then(() => mcpCall(token, 'get_report_properties', { report_id: reportId })).then((properties) => {
          const widgetsConfig = JSON.parse(properties.report.widgetsConfig || properties.report.widgets_config)
          expect(Object.keys(widgetsConfig.config.dashboardsById)).to.have.length(1)
        })
        cy.get('[data-testid="dataset-widgets"]', { timeout: 120000 }).should('have.length', 1)
        cy.get(LAYER_SELECTOR, { timeout: 60000 }).should('not.exist')
      })
    })
  })
})
