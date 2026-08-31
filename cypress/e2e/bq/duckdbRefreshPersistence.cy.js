/* eslint-disable no-undef */

import { addDuckDBQuery, assertQueryAndDatasetLabels, assertQueryStatus, createLoadedBigQuerySource, enterVisibleQuery, openHistory, publishCurrentReport, runBigQuery, runDuckDBQuery, saveVisibleQuery, selectDuckDBQuery } from './duckdbRefreshHelpers'

describe('DuckDB persistence from BigQuery', () => {
  beforeEach(() => {
    cy.resetCloudTestDatabase()
    cy.setDevClaimsEmail('duckdb-refresh@example.com')
    cy.visit('/')
    cy.ensureTestWorkspace()
  })

  it('clears visible source rows when an empty result has no response body', () => {
    createLoadedBigQuerySource()
    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 1"')
    cy.assertDatasetRows('Query 2', 1)

    cy.intercept('GET', '**/api/v1/dataset-source/**', {
      statusCode: 204
    }).as('bodylessEmptySource')
    cy.contains('[role="tab"]', 'Query 1').click({ force: true })
    runBigQuery("SELECT source_version, longitude, latitude FROM UNNEST([STRUCT('empty' AS source_version, 13.4 AS longitude, 52.5 AS latitude)]) WHERE FALSE")
    cy.wait('@bodylessEmptySource', { timeout: 120000 })
    cy.assertDatasetRows('Query 1', 0)

    cy.contains('[role="tab"]', 'Query 2').click({ force: true })
    assertQueryStatus('Query Error', 120000)
    cy.assertDatasetRows('Query 2', 0)
  })

  it('invalidates a prior DuckDB result when its saved SQL is cleared', () => {
    createLoadedBigQuerySource()
    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 1"')
    cy.assertDatasetRows('Query 2', 1)

    cy.intercept('POST', '**/Dekart/UpdateReport').as('saveClearedDuckDBSQL')
    enterVisibleQuery('')
    cy.wait('@saveClearedDuckDBSQL')
    cy.get('button#dekart-refresh-button').click()
    cy.get('#dekart-refresh-now-button').click()

    assertQueryStatus('Query Error', 120000)
    cy.assertDatasetRows('Query 2', 0)
  })

  it('stops the refresh indicator after a chained DuckDB refresh completes', () => {
    createLoadedBigQuerySource()
    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 1"')

    const descendantSQL = 'SELECT source_version, longitude, latitude FROM datasets."Query 2"'
    const descendantDraftSQL = `-- saved definition\n${descendantSQL} WHERE longitude < 0`
    addDuckDBQuery(descendantSQL)
    cy.assertDatasetRows('Query 3', 1)

    saveVisibleQuery(descendantDraftSQL, 'saveDescendantDraft')
    cy.contains('[role="tab"]', 'Query 2').click({ force: true })
    cy.get('#dekart-query-execute-button').click()
    assertQueryStatus('Ready', 120000)

    cy.contains('[role="tab"]', 'Query 3').click({ force: true })
    cy.contains('.ace_editor:visible .ace_line', '-- saved definition').should('be.visible')
    assertQueryStatus('Ready')
    // The server-owned graph deliberately uses the current saved Query definition
    // on the next reconciliation trigger.
    cy.assertDatasetRows('Query 3', 0)

    saveVisibleQuery(descendantSQL, 'saveDescendantSQL')

    cy.contains('[role="tab"]', 'Query 1').click({ force: true })
    saveVisibleQuery("SELECT 'refresh-1' AS source_version, 13.4 AS longitude, 52.5 AS latitude UNION ALL SELECT 'refresh-2', 13.5, 52.6", 'saveUpdatedSourceSQL')
    cy.get('button#dekart-refresh-button').click()
    cy.get('#dekart-refresh-now-button').click()
    cy.get('button#dekart-refresh-button .anticon-loading', { timeout: 30000 }).should('exist')
    cy.get('button#dekart-refresh-button .anticon-loading', { timeout: 120000 }).should('not.exist')

    cy.contains('[role="tab"]', 'Query 2').click({ force: true })
    assertQueryStatus('Ready')
    cy.assertDatasetRows('Query 2', 2)
    cy.contains('[role="tab"]', 'Query 3').click({ force: true })
    assertQueryStatus('Ready')
    cy.assertDatasetRows('Query 3', 2)
    cy.assertDatasetTable('Query 3', ['source_version'], ['refresh-1', 'refresh-2'])
  })

  it('reconciles a DuckDB chain before a public viewer opens it', () => {
    createLoadedBigQuerySource()
    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 1"')
    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 2"')
    cy.assertDatasetTable('Query 3', ['source_version'], ['loaded-first'])
    publishCurrentReport()

    cy.contains('[role="tab"]', 'Query 1').click({ force: true })
    runBigQuery("SELECT 'recovered-source' AS source_version, 13.5 AS longitude, 52.6 AS latitude")
    cy.contains('[role="tab"]', 'Query 3').click({ force: true })
    assertQueryStatus('Ready', 300000)

    cy.location('pathname').then(pathname => {
      cy.setDevClaimsEmail('duckdb-interrupted-viewer@example.com')
      cy.visit(pathname)
    })
    cy.contains('[role="tab"]', 'Query 2', { timeout: 30000 }).click({ force: true })
    assertQueryStatus('Ready', 300000)
    cy.contains('[role="tab"]', 'Query 3').click({ force: true })
    assertQueryStatus('Ready', 300000)
    // Wait for the full graph before opening a modal; the descendant's Kepler
    // publication can otherwise replace the data-table UI mid-assertion.
    cy.contains('[role="tab"]', 'Query 2').click({ force: true })
    cy.assertDatasetTable('Query 2', ['source_version'], ['recovered-source'])
    cy.contains('[role="tab"]', 'Query 3').click({ force: true })
    cy.assertDatasetTable('Query 3', ['source_version'], ['recovered-source'])
  })

  it('restores a DuckDB definition and materializes the restored job', () => {
    createLoadedBigQuerySource()
    addDuckDBQuery('SELECT \'before\' AS snapshot_marker, longitude, latitude FROM datasets."Query 1"')
    cy.assertDatasetTable('Query 2', ['snapshot_marker'], ['before'])

    runDuckDBQuery('SELECT \'after\' AS snapshot_marker, longitude, latitude FROM datasets."Query 1"')
    cy.assertDatasetTable('Query 2', ['snapshot_marker'], ['after'])

    openHistory()
    cy.contains('.ant-modal:visible', 'total changes', { timeout: 30000 })
    cy.get('.ant-modal:visible .ant-tag').filter(':contains("Map Edit")').eq(1)
      .closest('[class*="changeItem"]').contains('button', 'Restore').click()
    cy.contains('Snapshot restored', { timeout: 30000 }).should('be.visible')

    cy.contains('[role="tab"]', 'Query 2', { timeout: 30000 }).click({ force: true })
    assertQueryStatus('Ready', 300000)
    cy.assertDatasetTable('Query 2', ['snapshot_marker'], ['before'])
  })

  it('removes the README placeholder without disturbing the DuckDB catalog', () => {
    createLoadedBigQuerySource()
    cy.get('span[title="Dataset setting"]').first().click()
    cy.get('#dekart-dataset-name-input').clear().type('New')
    cy.get('#dekart-save-dataset-name-button').click()

    cy.get('button.ant-tabs-nav-add:visible').click()
    cy.get('[role="tab"]', { timeout: 30000 }).last().click({ force: true })
    selectDuckDBQuery()
    runDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."New"')
    cy.assertDatasetTable('Query 2', ['source_version'], ['loaded-first'])

    cy.get('button.ant-tabs-nav-add:visible').click()
    cy.get('[role="tab"]', { timeout: 30000 }).last().click({ force: true })
    cy.contains('[role="tab"]', 'Query 2').click({ force: true })
    assertQueryStatus('Query Error', 120000)
    cy.get('#dekart-query-status-message').parent().should('contain', 'ambiguous')
    cy.get('[role="tab"]').last().click({ force: true })
    cy.intercept('POST', '**/Dekart/AddReadme').as('addReadme')
    cy.contains('button', 'Write README').click()
    cy.wait('@addReadme')

    cy.contains('.ant-tabs-tab', 'Readme', { timeout: 30000 }).should('be.visible')
    cy.get('[role="tab"]').filter(':contains("New")').should('have.length', 1)
    cy.contains('[role="tab"]', 'Query 2').click({ force: true }).should('have.attr', 'aria-selected', 'true')
    assertQueryStatus('Ready', 300000)
    cy.assertDatasetTable('Query 2', ['source_version'], ['loaded-first'])
  })

  it('recreates the DuckDB dependency chain after fork', () => {
    createLoadedBigQuerySource()
    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 1"')
    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 2"')

    cy.location('pathname').then(originalPath => {
      cy.get('button#dekart-fork-button').click()
      cy.contains('span', 'Fork of Untitled', { timeout: 30000 }).should('be.visible')
      cy.location('pathname', { timeout: 30000 }).should('not.equal', originalPath)
    })

    cy.reload()
    cy.contains('Datasets(3)', { timeout: 120000 }).should('be.visible')
    assertQueryAndDatasetLabels(['Query 1', 'Query 2', 'Query 3'])
    cy.assertDatasetRows('Query 1', 1)
    cy.assertDatasetRows('Query 2', 1)
    cy.assertDatasetRows('Query 3', 1)
    cy.assertDatasetTable('Query 3', ['source_version', 'longitude', 'latitude'], ['loaded-first'])
    cy.contains('[role="tab"]', 'Query 3').click({ force: true })
    assertQueryStatus('Ready')

    cy.contains('[role="tab"]', 'Query 1').click({ force: true })
    runBigQuery("SELECT 'fork-updated-1' AS source_version, 13.4 AS longitude, 52.5 AS latitude UNION ALL SELECT 'fork-updated-2', 13.5, 52.6")
    cy.assertDatasetRows('Query 1', 2)
    cy.assertDatasetRows('Query 2', 2)
    cy.assertDatasetRows('Query 3', 2)
    assertQueryAndDatasetLabels(['Query 1', 'Query 2', 'Query 3'])
    cy.assertDatasetTable('Query 3', ['source_version'], ['fork-updated-1', 'fork-updated-2'])
  })
})
