// Regression: Report updates discard unsaved SQL parameters and typed input (5180a76, fa86eb3).
/* eslint-disable no-undef */
import { CreateQueryResponse, Query, QueryParam, UpdateReportRequest } from 'dekart-proto/dekart_pb'
import { createReport, selectDuckDB } from '../local/duckdbHelpers'
import { saveReport } from './queryParameterHelpers'
import { enterVisibleQuery, queryParameterInput } from '../bq/duckdbRefreshHelpers'

// Send another client's save using the server's current report and query versions.
function renameReportRemotely (save, queryId) {
  const requestBytes = Cypress.Buffer.from(save.request.body)
  const request = UpdateReportRequest.deserializeBinary(
    new Uint8Array(requestBytes.buffer, requestBytes.byteOffset + 5, requestBytes.length - 5)
  )
  request.setTitle('Remote parameter stream')
  // A title-only save must not resubmit query edits from the captured request.
  request.setQueryList([])
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
  // The simulated client must observe the versions it changes, including the query source.
  return cy.psql(`SELECT version_id,
    coalesce((SELECT query_source_id FROM queries WHERE id='${queryId || '00000000-0000-0000-0000-000000000000'}'), '')
    FROM reports WHERE id='${request.getReportId()}'`).then(({ stdout }) => {
    const [reportVersion, querySourceId] = stdout.split('|')
    request.setExpectedVersionId(reportVersion)
    if (queryId) request.getQueryList()[0].setQuerySourceId(querySourceId)
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
  })
}

describe('query parameters during report stream updates', () => {
  // The response stays held while Cypress types three inputs and performs a remote save.
  it('retains B, _x and a typed while their SQL save completes', { defaultCommandTimeout: 15000 }, () => {
    cy.setDevClaimsEmail(`parameter-save-${Date.now()}@example.com`)
    cy.visit('/')
    cy.ensureTestWorkspace()
    createReport()
    selectDuckDB()
    cy.enterQuery('SELECT 1')
    saveReport()

    // Hold the accepted save until all three draft inputs are visible.
    let releaseSave
    let acceptedSave
    cy.intercept({ method: 'POST', url: '**/Dekart/UpdateReport', times: 1 }, request => {
      request.continue(response => new Promise(resolve => {
        acceptedSave = { request, response }
        releaseSave = resolve
      }))
    }).as('parameterSave')
    enterVisibleQuery("SELECT CONCAT({{B}}, '|', {{_x}}, '|', {{a}}) AS binding")
    cy.wrap(null).should(() => expect(releaseSave).to.be.a('function'))
    queryParameterInput('B').clear().type('upper').should('have.value', 'upper')
    queryParameterInput('_x').clear().type('underscore').should('have.value', 'underscore')
    queryParameterInput('a').clear().type('lower').should('have.value', 'lower')
    // Keep local autosave busy until the other client has used this accepted version.
    cy.then(() => renameReportRemotely(acceptedSave))
    cy.then(() => releaseSave())
    cy.wait('@parameterSave')
    cy.get('#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
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
    cy.wait('@baselineSave').as('savedReport')
    // Let the completed save clear its real timers before pausing autosave for the draft.
    cy.clock(Date.now(), ['setTimeout', 'clearTimeout'])

    // Keep the edit unsaved while the independent save arrives through the real stream.
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
