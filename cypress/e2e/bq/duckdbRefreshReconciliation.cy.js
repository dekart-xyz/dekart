/* eslint-disable no-undef */

import { addDuckDBQuery, assertQueryStatus, createLoadedBigQuerySource, enterVisibleQuery, getCurrentReportId, publishCurrentReport, runBigQuery } from './duckdbRefreshHelpers'

describe('DuckDB reconciliation from BigQuery', () => {
  beforeEach(() => {
    cy.resetCloudTestDatabase()
    cy.setDevClaimsEmail('duckdb-refresh@example.com')
    cy.visit('/')
    cy.ensureTestWorkspace()
  })

  it('persists DuckDB dependency validation after a source is renamed', () => {
    createLoadedBigQuerySource()
    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 1"')
    cy.assertDatasetRows('Query 2', 1)

    cy.get('span[title="Dataset setting"]').first().click()
    cy.get('#dekart-dataset-name-input').clear().type('Renamed Source')
    cy.get('#dekart-save-dataset-name-button').click()
    cy.contains('[role="tab"]', 'Query 2', { timeout: 30000 }).click({ force: true })
    assertQueryStatus('Query Error', 120000)
    cy.reload()
    cy.contains('[role="tab"]', 'Query 2', { timeout: 30000 }).click({ force: true })
    assertQueryStatus('Query Error', 120000)
  })

  it('uses a legacy completed BigQuery result as a DuckDB source', () => {
    createLoadedBigQuerySource()
    // needed to simulate an old persisted query job
    getCurrentReportId().then(reportId => {
      cy.psql(`
        UPDATE query_jobs
        SET job_status=3
        WHERE query_id IN (
          SELECT query_id FROM datasets
          WHERE report_id='${reportId}' AND query_id IS NOT NULL
        )
      `)
    })
    cy.reload()
    assertQueryStatus('Ready', 30000)

    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 1"')
    cy.assertDatasetTable('Query 2', ['source_version'], ['loaded-first'])
  })

  it('publishes the reconciled source revision to a public viewer', () => {
    createLoadedBigQuerySource()
    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 1"')
    cy.assertDatasetTable('Query 2', ['source_version'], ['loaded-first'])

    publishCurrentReport()

    cy.contains('[role="tab"]', 'Query 1').click({ force: true })
    runBigQuery("SELECT 'newer-source' AS source_version, 13.5 AS longitude, 52.6 AS latitude")
    cy.assertDatasetRows('Query 1', 1)

    cy.location('pathname').then(pathname => {
      cy.setDevClaimsEmail('duckdb-public-viewer@example.com')
      cy.visit(pathname)
    })
    cy.contains('[role="tab"]', 'Query 2', { timeout: 30000 }).click({ force: true })
    assertQueryStatus('Ready', 300000)
    cy.assertDatasetTable('Query 2', ['source_version'], ['newer-source'])
    cy.get('#dekart-query-execute-button').should('not.exist')
  })

  it('reports a source refresh failure instead of waiting indefinitely', () => {
    createLoadedBigQuerySource()
    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 1"')
    cy.assertDatasetRows('Query 2', 1)

    cy.contains('[role="tab"]', 'Query 1').click({ force: true })
    enterVisibleQuery('SELECT FROM')
    cy.get('#dekart-query-execute-button').click()
    assertQueryStatus('Query Error', 120000)

    cy.contains('[role="tab"]', 'Query 2').click({ force: true })
    cy.get('#dekart-query-status-message', { timeout: 60000 }).should($status => {
      const message = $status.text().replace(/\s+/g, ' ')
      expect(message).to.contain('Query Error')
    })
    cy.assertDatasetRows('Query 2', 0)

    cy.get('#dekart-query-execute-button').click()
    assertQueryStatus('Query Error', 120000)
    cy.get('#dekart-query-status-message').should('not.contain', 'Waiting for source data')
  })

  it('keeps DuckDB descendants failed when a source download is cancelled', () => {
    createLoadedBigQuerySource()
    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 1"')

    cy.intercept('GET', '**/api/v1/dataset-source/**', req => {
      req.continue(res => res.setDelay(3000))
    }).as('delayedSourceDownload')

    cy.contains('[role="tab"]', 'Query 1').click({ force: true })
    runBigQuery("SELECT 'cancelled-source' AS source_version, 13.5 AS longitude, 52.6 AS latitude")
    cy.contains('Downloading Map Data', { timeout: 30000 }).should('be.visible')
    cy.contains('button', 'Cancel').click()

    cy.contains('[role="tab"]', 'Query 2').click({ force: true })
    assertQueryStatus('Query Error', 30000)
    cy.wait(4000)
    assertQueryStatus('Query Error')

    cy.contains('[role="tab"]', 'Query 1').click({ force: true })
    runBigQuery("SELECT 'recovered-source' AS source_version, 13.6 AS longitude, 52.7 AS latitude")
    cy.contains('Downloading Map Data', { timeout: 30000 }).should('be.visible')
    cy.contains('[role="tab"]', 'Query 2').click({ force: true })
    assertQueryStatus('Waiting for source data', 30000)
    assertQueryStatus('Ready', 120000)
    cy.assertDatasetTable('Query 2', ['source_version'], ['recovered-source'])
  })

  it('rebuilds the DuckDB layer after page reload and source query rerun', () => {
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.contains('button', 'Run SQL').first().click()
    runBigQuery("SELECT 'before' AS source_version, 13.4 AS longitude, 52.5 AS latitude")

    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 1" ORDER BY source_version')
    cy.assertDatasetTable('Query 2', ['source_version'], ['before'])

    cy.reload()
    cy.assertDatasetRows('Query 2', 1)
    cy.assertDatasetTable('Query 2', ['source_version'], ['before'])

    cy.contains('[role="tab"]', 'Query 1', { timeout: 30000 }).click({ force: true })
    runBigQuery("SELECT 'after-1' AS source_version, 13.5 AS longitude, 52.6 AS latitude UNION ALL SELECT 'after-2', 13.6, 52.7")
    cy.assertDatasetRows('Query 2', 2)
    cy.assertDatasetTable('Query 2', ['source_version'], ['after-1', 'after-2'])
  })

  it('refreshes visible and derived data when a source becomes empty', () => {
    createLoadedBigQuerySource()
    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 1"')
    cy.assertDatasetRows('Query 2', 1)

    cy.contains('[role="tab"]', 'Query 1').click({ force: true })
    runBigQuery("SELECT source_version, longitude, latitude FROM UNNEST([STRUCT('empty' AS source_version, 13.4 AS longitude, 52.5 AS latitude)]) WHERE FALSE")
    cy.assertDatasetRows('Query 1', 0)
    cy.contains('[role="tab"]', 'Query 2').click({ force: true })
    assertQueryStatus('Ready', 300000)
    cy.assertDatasetRows('Query 2', 0)

    cy.contains('[role="tab"]', 'Query 1').click({ force: true })
    runBigQuery("SELECT 'restored' AS source_version, 13.5 AS longitude, 52.6 AS latitude")
    cy.contains('[role="tab"]', 'Query 2').click({ force: true })
    assertQueryStatus('Ready', 300000)
    cy.assertDatasetRows('Query 2', 1)
    cy.assertDatasetTable('Query 2', ['source_version'], ['restored'])
  })
})
