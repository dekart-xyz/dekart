/* eslint-disable no-undef */
import { createReport } from '../local/duckdbHelpers'

const connectionID = '00000000-0000-0000-0000-00000000a001'
const sourceID = '00000000-0000-0000-0000-00000000a002'
const oldURL = 'https://raw.githubusercontent.com/dekart-xyz/dekart/main/cypress/fixtures/sample.csv'

// An old job must not send a connection's newly saved headers to its previous API.
describe('HTTP source credentials after a base URL change', () => {
  it('rejects an old source URL before fetching with the current connection', () => {
    cy.resetCloudTestDatabase()
    cy.setDevClaimsEmail('http-source-credentials@dekart.xyz')
    cy.visit('/')
    cy.ensureTestWorkspace()
    createReport()
    cy.contains('button', 'DuckDB').click()
    cy.get('.ace_editor:visible').should('exist')
    cy.location('pathname').then(pathname => {
      const reportID = pathname.match(/reports\/([0-9a-f-]+)/)[1]
      cy.psql(`
        INSERT INTO connections (id,connection_name,workspace_id,connection_type,http_base_url)
        SELECT '${connectionID}','Changed API',workspace_id,8,'https://example.com/' FROM reports WHERE id='${reportID}';
        INSERT INTO query_jobs (id,query_id,query_text,job_status,query_params_hash,http_sources)
        SELECT '00000000-0000-0000-0000-00000000a003',query_id,'SELECT 1',5,'http-source-credentials',
        '[{"connection_id":"${connectionID}","source_id":"${sourceID}","url":"${oldURL}","extension":"csv","file_name":"dekart_internal/http_old.csv"}]'
        FROM datasets WHERE report_id='${reportID}' AND query_id IS NOT NULL;
        SELECT id FROM datasets WHERE report_id='${reportID}' AND query_id IS NOT NULL;
      `).then(result => {
        const datasetID = result.stdout.trim().split('\n').pop()
        cy.request({
          url: `${Cypress.env('DEKART_E2E_API_URL')}/api/v1/dataset-source/${datasetID}/${sourceID}.csv`,
          headers: { 'X-Dekart-Claim-Email': 'http-source-credentials@dekart.xyz', 'X-Dekart-Report-Id': reportID },
          failOnStatusCode: false
        }).its('status').should('eq', 404)
      })
    })
  })
})
