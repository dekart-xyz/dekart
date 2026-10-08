/* eslint-disable no-undef */
import { createReport, runActiveDuckDBQuery, selectDuckDB, replaceEditorText } from '../local/duckdbHelpers'

const base = 'https://raw.githubusercontent.com/dekart-xyz/dekart/main/cypress/fixtures/'
const email = 'http-dataset-url@dekart.xyz'

// seedSource adds a public fixture connection to this test's local workspace.
function seedSource () {
  cy.location('pathname').should('match', /reports\/[0-9a-f-]+\/source/).then(path => {
    const report = path.match(/reports\/([0-9a-f-]+)/)[1]
    cy.psql(`INSERT INTO connections (id,connection_name,workspace_id,connection_type,http_base_url)
      SELECT gen_random_uuid(),'Dataset URL fixtures',workspace_id,8,'${base}' FROM reports WHERE id='${report}';`)
  })
}

// addQuery opens the next dataset through the report editor.
function addQuery () {
  cy.get('button.ant-tabs-nav-add:visible').first().click()
  cy.contains('[role="tab"]', 'New').click({ force: true })
  selectDuckDB()
}

// execute waits for the query's visible terminal status.
function execute (status = 'Ready') {
  cy.get('#dekart-query-execute-button').click()
  cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', status)
}

// stationURL reads the resolved argument sent through the authenticated download route.
function stationURL (interception) {
  return new URL(new URL(interception.request.url).searchParams.get('url')).searchParams.get('station')
}

describe('HTTP URLs from report datasets', () => {
  beforeEach(() => {
    cy.resetCloudTestDatabase()
    cy.setDevClaimsEmail(email)
    cy.visit('/')
    cy.ensureTestWorkspace()
    createReport()
    seedSource()
  })

  it('encodes one complete value, joins the response, refreshes and reuses the source after rename', () => {
    runActiveDuckDBQuery("SELECT 'A&B=one space' AS station, 52.5 AS latitude, 13.4 AS longitude")
    addQuery()
    cy.intercept('GET', '**/dataset-source/**').as('download')
    replaceEditorText(`SELECT response.*, station FROM read_csv((SELECT format('${base}sample.csv?station={}&fixed=one', station) FROM datasets."Query 1")) response CROSS JOIN datasets."Query 1"`)
    execute()
    cy.wait('@download').then(download => {
      expect(stationURL(download)).to.eq('A&B=one space')
      cy.assertDatasetRows('Query 2', 8276)
      cy.assertDatasetTable('Query 2', ['station'], ['A&B=one space'])
      cy.contains('[role="tab"]', 'Query 1').click()
      replaceEditorText("SELECT 'changed & value=2' AS station, 52.5 AS latitude, 13.4 AS longitude")
      execute()
      cy.get('@download.all').should(downloads => {
        expect(stationURL(downloads[downloads.length - 1])).to.eq('changed & value=2')
      })
      cy.contains('[role="tab"]', 'Query 2').click()
      cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
      cy.get('@download.all').then(downloads => {
        const reconciledPath = new URL(downloads[downloads.length - 1].request.url).pathname
        cy.intercept('GET', '**/dataset-source/**').as('explicitDownload')
        execute()
        cy.wait('@explicitDownload').then(next => {
          expect(stationURL(next)).to.eq('changed & value=2')
          expect(new URL(next.request.url).pathname).not.to.eq(reconciledPath)
          cy.get('#dekart-refresh-button').click()
          cy.contains('Refresh Now').click()
          cy.wait('@explicitDownload').then(refreshed => {
            expect(new URL(refreshed.request.url).pathname).not.to.eq(new URL(next.request.url).pathname)
            cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
            cy.location('pathname').then(path => {
              const report = path.match(/reports\/([0-9a-f-]+)/)[1]
              const sourceID = new URL(refreshed.request.url).pathname.split('/').pop().split('.')[0]
              cy.contains('[role="tab"]', 'Query 1').click()
              cy.get('.ant-tabs-tab-active .ant-tabs-tab-remove').click()
              cy.get('#dekart-dataset-name-input').clear().type('Stations')
              cy.get('#dekart-save-dataset-name-button').click()
              cy.get('#dekart-dataset-name-input').should('not.exist')
              cy.contains('[role="tab"]', 'Query 2').click()
              cy.get('#dekart-query-status-message', { timeout: 30000 }).should('contain', 'Query Error')
              cy.psql(`SELECT http_sources FROM query_jobs WHERE query_id=(SELECT query_id FROM datasets WHERE report_id='${report}' ORDER BY created_at DESC LIMIT 1) ORDER BY created_at DESC LIMIT 1;`)
                .its('stdout').should('contain', sourceID)
            })
          })
        })
      })
    })
  })

  for (const scenario of [
    { rows: 'SELECT station FROM datasets."Query 1" WHERE false', count: 0 },
    { rows: 'SELECT station FROM datasets."Query 1" UNION ALL SELECT station FROM datasets."Query 1"', count: 2 },
    { rows: 'SELECT NULL::VARCHAR AS station FROM datasets."Query 1"', count: 1 }
  ]) {
    it(`rejects ${scenario.count} URL rows or NULL before downloading`, () => {
      runActiveDuckDBQuery("SELECT 'station' AS station")
      addQuery()
      cy.intercept('GET', '**/dataset-source/**').as('download')
      replaceEditorText(`SELECT * FROM read_csv((SELECT format('${base}sample.csv?station={}', station) FROM (${scenario.rows}) input))`)
      execute('Query Error')
      cy.contains(`HTTP source URL query returned ${scenario.count} rows; exactly one non-empty URL is required.`).should('be.visible')
      cy.get('@download.all').should('have.length', 0)
    })
  }

  it('binds a parameter predicate before evaluating the URL and downloads again after a change', () => {
    runActiveDuckDBQuery("SELECT * FROM (VALUES ('A', 'first & value=1'), ('B', 'second & value=2')) stations(code, station)")
    addQuery()
    replaceEditorText(`SELECT * FROM read_csv((SELECT format('${base}sample.csv?station={}', station) FROM datasets."Query 1" WHERE code={{station}}))`)
    cy.contains('.ant-input-group-addon', 'station', { timeout: 30000 }).parent().find('input').first().clear().type('A')
    cy.intercept('GET', '**/dataset-source/**').as('parameterDownload')
    cy.get('button[title="Apply query parameters"]').click()
    cy.wait('@parameterDownload', { timeout: 120000 }).then(download => {
      expect(stationURL(download)).to.eq('first & value=1')
    })
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.contains('.ant-input-group-addon', 'station').parent().find('input').first().clear().type('B')
    cy.get('button[title="Apply query parameters"]').click()
    cy.wait('@parameterDownload', { timeout: 120000 }).then(download => {
      expect(stationURL(download)).to.eq('second & value=2')
    })
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.assertDatasetRows('Query 2', 8276)
  })

  it('rejects an outer column before downloading', () => {
    runActiveDuckDBQuery("SELECT 'station' AS station")
    addQuery()
    cy.intercept('GET', '**/dataset-source/**').as('download')
    replaceEditorText(`SELECT * FROM datasets."Query 1", read_csv((SELECT format('${base}sample.csv?station={}', station)))`)
    execute('Query Error')
    cy.contains('station').should('be.visible')
    cy.get('@download.all').should('have.length', 0)
  })
})
