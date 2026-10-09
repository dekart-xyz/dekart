// Regression: Switching from viewing to editing loses authored layers while parameter results are empty.
/* eslint-disable no-undef */
import { UpdateReportRequest, UpdateReportResponse } from 'dekart-proto/dekart_pb'
import { LAYER_SELECTOR, uploadActiveDataset } from '../local/duckdbHelpers'
import { ROW_LIMIT, createParameterizedReport, saveReport } from './queryParameterHelpers'

// Send an independent save using the public request and returned report version.
function hidePendingLayerRemotely (save) {
  const requestBytes = Cypress.Buffer.from(save.request.body)
  const responseBytes = Cypress.Buffer.from(save.response.body)
  const request = UpdateReportRequest.deserializeBinary(
    new Uint8Array(requestBytes.buffer, requestBytes.byteOffset + 5, requestBytes.length - 5)
  )
  const responseLength = responseBytes.readUInt32BE(1)
  const response = UpdateReportResponse.deserializeBinary(
    new Uint8Array(responseBytes.buffer, responseBytes.byteOffset + 5, responseLength)
  )
  const config = JSON.parse(request.getMapConfig())
  config.config.visState.layers[0].config.isVisible = false
  request.setMapConfig(JSON.stringify(config))
  request.setTitle('Remote pending layer')
  request.setExpectedVersionId(response.getVersionId())
  const payload = request.serializeBinary()
  const body = new Uint8Array(payload.length + 5)
  new DataView(body.buffer).setUint32(1, payload.length)
  body.set(payload, 5)
  return cy.window().then(win => win.fetch(`${Cypress.env('DEKART_E2E_API_URL')}/Dekart/UpdateReport`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/grpc-web+proto',
      'X-Grpc-Web': '1',
      Authorization: save.request.headers.authorization,
      'X-Dekart-Report-Id': request.getReportId()
    },
    body
  })).then(response => {
    expect(response.ok).to.equal(true)
    expect(response.headers.get('grpc-status'), decodeURIComponent(response.headers.get('grpc-message') || '')).to.be.oneOf([null, '0'])
  })
}

describe('view to edit query parameter save reproduction', () => {
  it('saves loaded-layer edits while another saved layer has no query result', () => {
    createParameterizedReport()
    cy.get('button.ant-tabs-nav-add:visible').first().click()
    uploadActiveDataset('sample.geojson')
    cy.get(LAYER_SELECTOR, { timeout: 120000 }).should('have.length', 2)
    saveReport()
    cy.location('pathname').as('editorPath').then(path => {
      const viewerPath = `${path.replace(/\/source$/, '')}?qp_station=`
      cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN', viewerPath)
      cy.visit(viewerPath)
    })
    cy.contains('.ant-select', 'Viewing', { timeout: 30000 }).should('be.visible')
    cy.openLayerPanel()
    cy.get(LAYER_SELECTOR, { timeout: 120000 }).should('have.length', 1)
    cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')
    cy.contains('.ant-select', 'Viewing').click()
    cy.contains('.ant-select-item-option-content', 'Editing').click()
    cy.location('pathname').should('match', /\/source$/)
    cy.openLayerPanel()
    cy.get(LAYER_SELECTOR).should('have.length', 1)

    cy.intercept('POST', '**/Dekart/UpdateReport').as('authoredSave')
    cy.get('.layer__visibility-toggle .panel--header__action__component').first().click()
    cy.get('.layer__visibility-toggle .panel--header__action__component').first()
      .should('have.attr', 'data-for').and('include', 'tooltip.showLayer')
    cy.wait('@authoredSave', { timeout: 10000 }).its('response.statusCode').should('eq', 200)
    cy.get('#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
    cy.get('@editorPath').then(path => {
      const populatedPath = `${path}?qp_station=DLA5%25`
      cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN', populatedPath)
      cy.visit(populatedPath)
    })
    cy.assertDatasetRows('Query 1', ROW_LIMIT)
    cy.get(LAYER_SELECTOR).should('have.length', 2)
    cy.get('.layer__visibility-toggle .panel--header__action__component[data-for*="tooltip.showLayer"]')
      .should('have.length', 1)
    cy.screenshot('authored-edit-with-pending-layer-reloaded')
  })

  it('adopts a remote layer change while its query result is empty', () => {
    createParameterizedReport()
    cy.location('pathname').then(path => {
      const viewerPath = `${path.replace(/\/source$/, '')}?qp_station=`
      cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN', viewerPath)
      cy.visit(viewerPath)
    })
    cy.contains('.ant-select', 'Viewing', { timeout: 30000 }).should('be.visible')
    cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')
    cy.get('@savedMapRequest').then(hidePendingLayerRemotely)
    cy.contains('Remote pending layer', { timeout: 30000 }).should('be.visible')
    cy.contains('.ant-select', 'Viewing').click()
    cy.contains('.ant-select-item-option-content', 'Editing').click()
    cy.location('pathname').should('match', /\/source$/)
    cy.contains('.ant-input-group-addon', 'station').parent().find('input').first().clear().type('DLA5%')
    cy.get('button[title="Apply query parameters"]').should('be.enabled').click()
    cy.assertDatasetRows('Query 1', ROW_LIMIT)
    cy.get(LAYER_SELECTOR).should('have.length', 1)
    cy.get('.layer__visibility-toggle .panel--header__action__component').first()
      .should('have.attr', 'data-for').and('include', 'tooltip.showLayer')
    cy.screenshot('remote-pending-layer-after-data-load')
  })
})
