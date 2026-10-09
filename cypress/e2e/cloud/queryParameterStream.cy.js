/* eslint-disable no-undef */
import { CreateQueryResponse, Query, QueryParam, UpdateReportRequest, UpdateReportResponse } from 'dekart-proto/dekart_pb'
import { createReport, selectDuckDB } from '../local/duckdbHelpers'
import { saveReport } from './queryParameterHelpers'
import { enterVisibleQuery, queryParameterInput } from '../bq/duckdbRefreshHelpers'

// Send another client's save from the last accepted request and report version.
function renameReportRemotely (save, queryId) {
  const requestBytes = Cypress.Buffer.from(save.request.body)
  const responseBytes = Cypress.Buffer.from(save.response.body)
  const request = UpdateReportRequest.deserializeBinary(
    new Uint8Array(requestBytes.buffer, requestBytes.byteOffset + 5, requestBytes.length - 5)
  )
  const response = UpdateReportResponse.deserializeBinary(
    new Uint8Array(responseBytes.buffer, responseBytes.byteOffset + 5, responseBytes.readUInt32BE(1))
  )
  request.setTitle('Remote parameter stream')
  request.setExpectedVersionId(response.getVersionId())
  // A title-only save leaves the existing SQL and parameter definitions intact.
  if (queryId) {
    const query = new Query()
    query.setId(queryId)
    query.setQueryText('SELECT {{remote}} AS remote')
    request.setQueryList([query])
    const parameter = new QueryParam()
    parameter.setName('remote')
    parameter.setType(QueryParam.Type.TYPE_STRING)
    parameter.setDefaultValue('Remote default')
    request.setQueryParamsList([parameter])
  }
  const payload = request.serializeBinary()
  const body = new Uint8Array(payload.length + 5)
  new DataView(body.buffer).setUint32(1, payload.length)
  body.set(payload, 5)
  return cy.window().then(win => win.fetch(`${Cypress.env('DEKART_E2E_API_URL')}/Dekart/UpdateReport`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/grpc-web+proto',
      'X-Grpc-Web': '1',
      'X-Dekart-Claim-Email': save.request.headers['x-dekart-claim-email'],
      'X-Dekart-Report-Id': request.getReportId()
    },
    body
  })).then(response => {
    expect(response.ok).to.equal(true)
    expect(response.headers.get('grpc-status')).to.be.oneOf([null, '0'])
  })
}

describe('query parameters during report stream updates', () => {
  it('retains B, _x and a typed while their SQL save completes', () => {
    cy.setDevClaimsEmail(`parameter-save-${Date.now()}@example.com`)
    cy.visit('/')
    cy.ensureTestWorkspace()
    createReport()
    selectDuckDB()
    cy.enterQuery('SELECT 1')
    saveReport()

    // Hold the accepted save until all three draft inputs are visible.
    let releaseSave
    cy.intercept({ method: 'POST', url: '**/Dekart/UpdateReport', times: 1 }, request => {
      request.continue(() => new Promise(resolve => { releaseSave = resolve }))
    }).as('parameterSave')
    enterVisibleQuery("SELECT CONCAT({{B}}, '|', {{_x}}, '|', {{a}}) AS binding")
    cy.wrap(null).should(() => expect(releaseSave).to.be.a('function'))
    queryParameterInput('B').clear().type('upper').should('have.value', 'upper')
    queryParameterInput('_x').clear().type('underscore').should('have.value', 'underscore')
    queryParameterInput('a').clear().type('lower').should('have.value', 'lower')
    cy.then(() => releaseSave())
    cy.wait('@parameterSave').then(save => {
      cy.get('#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
      renameReportRemotely(save)
    })
    cy.contains('Remote parameter stream', { timeout: 30000 }).should('be.visible')
    queryParameterInput('B').should('have.value', 'upper')
    queryParameterInput('_x').should('have.value', 'underscore')
    queryParameterInput('a').should('have.value', 'lower')
    cy.get('button[title="Apply query parameters"]').should('be.enabled').click()
    cy.assertDatasetTable('Query 1', ['binding'], ['upper|underscore|lower'])
  })

  it('preserves parameters and input for unsaved SQL when another client saves', () => {
    cy.setDevClaimsEmail(`parameter-stream-${Date.now()}@example.com`)
    cy.visit('/')
    cy.ensureTestWorkspace()
    createReport()
    selectDuckDB()
    cy.get('.ace_editor:visible', { timeout: 30000 }).should('be.visible')
    cy.enterQuery('SELECT 1')
    saveReport()
    cy.get('button.ant-tabs-nav-add:visible').first().click()
    cy.intercept('POST', '**/Dekart/CreateQuery').as('secondQuery')
    selectDuckDB()
    cy.wait('@secondQuery').then(({ response }) => {
      const bytes = Cypress.Buffer.from(response.body)
      const query = CreateQueryResponse.deserializeBinary(
        new Uint8Array(bytes.buffer, bytes.byteOffset + 5, bytes.readUInt32BE(1))
      )
      cy.wrap(query.getQueryId()).as('secondQueryId')
    })
    cy.enterQuery('SELECT 2')
    cy.intercept('POST', '**/Dekart/UpdateReport').as('baselineSave')
    saveReport()
    // Let saves queued while the empty query was created settle before reusing their version.
    cy.wait(1500)
    cy.get('@baselineSave.all').then(saves => cy.wrap(saves[saves.length - 1]).as('savedReport'))

    // Keep the edit unsaved while the independent save arrives through the real stream.
    cy.clock(Date.now(), ['setTimeout', 'clearTimeout'])
    cy.contains('[role="tab"]', 'Query 1').click()
    cy.enterQuery('SELECT {{station}} AS station')
    cy.contains('.ant-input-group-addon', 'station').parent().find('input').type('DLA5')
    cy.get('@savedReport').then(save => cy.get('@secondQueryId').then(queryId => renameReportRemotely(save, queryId)))
    cy.contains('Remote parameter stream', { timeout: 30000 }).should('be.visible')
    cy.get('.ace_content').should('contain', '{{station}}')
    cy.contains('.ant-input-group-addon', 'station').parent().find('input').should('have.value', 'DLA5')
    cy.contains('.ant-input-group-addon', 'remote').parent().find('input').should('have.value', 'Remote default')
    cy.clock().invoke('restore')
    saveReport()
    cy.reload()
    cy.contains('.ant-input-group-addon', 'station', { timeout: 30000 }).should('be.visible')
    cy.contains('.ant-input-group-addon', 'remote').should('be.visible')
    cy.get('.ace_content').should('contain', '{{station}}')
  })
})
