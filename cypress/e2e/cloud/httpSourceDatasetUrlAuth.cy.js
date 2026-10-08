/* eslint-disable no-undef */
import { createReport, runActiveDuckDBQuery } from '../local/duckdbHelpers'

const base = 'https://raw.githubusercontent.com/dekart-xyz/dekart/main/cypress/fixtures/'
const owner = 'http-url-owner@dekart.xyz'

// requestSource uses the same report scope as browser downloads.
function requestSource (url, report, email = owner) {
  return cy.request({ url, headers: {
    'X-Dekart-Report-Id': report,
    ...(email ? { 'X-Dekart-Claim-Email': email } : {})
  }, failOnStatusCode: false })
}

// withSource creates a real recorded job through the editor before testing route authorization.
function withSource (computed, check) {
  cy.resetCloudTestDatabase()
  cy.setDevClaimsEmail(owner)
  cy.visit('/')
  cy.ensureTestWorkspace()
  createReport()
  cy.location('pathname').should('match', /reports\/[0-9a-f-]+\/source/).then(path => {
    const report = path.match(/reports\/([0-9a-f-]+)/)[1]
    cy.psql(`INSERT INTO connections (id,connection_name,workspace_id,connection_type,http_base_url)
      SELECT gen_random_uuid(),'URL auth fixture',workspace_id,8,'${base}' FROM reports WHERE id='${report}';`)
    cy.intercept('GET', '**/dataset-source/**').as('download')
    const argument = computed ? `(SELECT format('${base}sample.csv?station={}&fixed=one', 'A'))` : `'${base}sample.csv'`
    runActiveDuckDBQuery(`SELECT * FROM read_csv(${argument}) LIMIT 1`)
    cy.wait('@download').then(({ request }) => check(request.url, report))
  })
}

describe('computed HTTP source download authorization', () => {
  it('rejects changes to the path, host, keys, fixed values and duplicate or missing url', () => {
    withSource(true, (download, report) => {
      const original = new URL(download).searchParams.get('url')
      for (const target of [
        original.replace('sample.csv', 'sample.parquet'),
        original.replace('raw.githubusercontent.com', 'example.com'),
        original.replace('station=', 'other='),
        original.replace('fixed=one', 'fixed=two')
      ]) {
        const url = new URL(download)
        url.searchParams.set('url', target)
        requestSource(url.toString(), report).its('status').should('eq', 404)
      }
      requestSource(`${download}&url=${encodeURIComponent(original)}`, report).its('status').should('eq', 404)
      requestSource(download.split('?')[0], report).its('status').should('eq', 404)
    })
  })

  it('rejects url on a constant source', () => {
    withSource(false, (download, report) => {
      requestSource(`${download}?url=${encodeURIComponent(base + 'sample.csv')}`, report).its('status').should('eq', 404)
    })
  })

  it('allows a shared viewer and an anonymous public reader to choose another complete value', () => {
    withSource(true, (download, report) => {
      const url = new URL(download)
      url.searchParams.set('url', `${base}sample.csv?station=other%26value&fixed=one`)
      cy.psql(`INSERT INTO report_access_log (report_id,email,status,access_level,authored_by) VALUES ('${report}','http-url-viewer@dekart.xyz',1,1,'${owner}');`)
      requestSource(url.toString(), report, 'http-url-viewer@dekart.xyz').its('status').should('eq', 200)
      cy.psql(`UPDATE reports SET is_public=true WHERE id='${report}';`)
      cy.clearCookies()
      requestSource(url.toString(), report, null).its('status').should('eq', 200)
    })
  })

  it('rejects a source id used through another report dataset', () => {
    withSource(true, (download, report) => {
      createReport()
      runActiveDuckDBQuery('SELECT 1 AS value')
      cy.location('pathname').should('match', /reports\/[0-9a-f-]+\/source/).then(path => {
        const otherReport = path.match(/reports\/([0-9a-f-]+)/)[1]
        cy.psql(`SELECT id FROM datasets WHERE report_id='${otherReport}' AND query_id IS NOT NULL`).then(result => {
          const url = new URL(download)
          url.pathname = url.pathname.replace(/dataset-source\/[^/]+/, `dataset-source/${result.stdout.trim()}`)
          requestSource(url.toString(), otherReport).its('status').should('eq', 404)
        })
      })
    })
  })
})
