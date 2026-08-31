/* eslint-disable no-undef */

import { CHICAGO_CRIME_SAMPLE_QUERY, addDuckDBQuery, assertDatasetIsNonEmpty, assertQueryStatus, createLoadedBigQuerySource, enterVisibleQuery, queryParameterInput, runBigQuery, selectDuckDBQuery } from './duckdbRefreshHelpers'

describe('DuckDB refresh from BigQuery', () => {
  beforeEach(() => {
    cy.resetCloudTestDatabase()
    cy.setDevClaimsEmail('duckdb-refresh@example.com')
    cy.visit('/')
    cy.ensureTestWorkspace()
  })

  it('scopes report dataset completion to DuckDB while switching query tabs', () => {
    createLoadedBigQuerySource()
    cy.get('button.ant-tabs-nav-add:visible').click()
    cy.contains('[role="tab"]', 'New').click({ force: true })
    selectDuckDBQuery()

    cy.get('.ace_editor:visible textarea').type('datasets.', { force: true })
    cy.get('.ace_autocomplete:visible', { timeout: 20000 }).should('contain.text', 'Query 1')

    cy.contains('[role="tab"]', 'Query 1').click({ force: true })
    enterVisibleQuery('datasets')
    cy.get('.ace_editor:visible textarea').type('.', { force: true })
    cy.get('body').should($body => {
      expect($body.find('.ace_autocomplete:visible').text()).not.to.include('Query 1')
    })

    cy.contains('[role="tab"]', 'Query 2').click({ force: true })
    enterVisibleQuery('datasets')
    cy.get('.ace_editor:visible textarea').type('.', { force: true })
    cy.get('.ace_autocomplete:visible', { timeout: 20000 }).should('contain.text', 'Query 1')
  })

  it('shows feedback when an accepted DuckDB query is materialized', () => {
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.contains('button', 'Run SQL').first().click()
    runBigQuery(CHICAGO_CRIME_SAMPLE_QUERY)
    assertDatasetIsNonEmpty('Query 1')

    addDuckDBQuery('SELECT primary_type, district, latitude, longitude, date FROM datasets."Query 1"')

    cy.intercept('POST', '**/Dekart/RunDuckDBQuery').as('acceptedDuckDBExecute')
    enterVisibleQuery('SELECT count(*) AS source_rows, \'re-executed\' AS execution_marker FROM datasets."Query 1"')
    cy.get('#dekart-query-execute-button').click({ waitForAnimations: false })
    cy.wait('@acceptedDuckDBExecute')
    cy.get('#dekart-query-status-message').should($status => {
      expect(['Running', 'Ready']).to.include($status.text().trim())
    })
    assertQueryStatus('Ready', 300000)
    cy.get('#dekart-query-execute-button').should('not.be.disabled')
    cy.assertDatasetRows('Query 2', 1)
    cy.assertDatasetTable('Query 2', ['source_rows', 'execution_marker'], ['re-executed'])
  })

  it('re-enables Execute after a DuckDB command transport failure', () => {
    cy.get('button#dekart-create-report').click()
    cy.contains('button', 'Run SQL').first().click()
    cy.get('button.ant-tabs-nav-add:visible').click()
    cy.contains('[role="tab"]', 'New').click({ force: true })
    selectDuckDBQuery()
    enterVisibleQuery('SELECT 1 AS recovered')
    cy.intercept('POST', '**/Dekart/RunDuckDBQuery', { forceNetworkError: true }).as('failedDuckDBExecute')

    cy.get('#dekart-query-execute-button').click()
    cy.wait('@failedDuckDBExecute')
    cy.get('#dekart-query-execute-button').should('not.be.disabled')
  })

  it('re-enables Execute after a warehouse command transport failure', () => {
    cy.get('button#dekart-create-report').click()
    cy.contains('button', 'Run SQL').first().click()
    enterVisibleQuery('SELECT 1 AS recovered')
    cy.intercept('POST', '**/Dekart/RunQuery', { forceNetworkError: true }).as('failedWarehouseExecute')

    cy.get('#dekart-query-execute-button').click()
    cy.wait('@failedWarehouseExecute')
    cy.get('#dekart-query-execute-button').should('not.be.disabled')
  })

  it('does not execute DuckDB while SQL is being typed', () => {
    createLoadedBigQuerySource()
    cy.get('button.ant-tabs-nav-add:visible').click()
    selectDuckDBQuery()
    cy.intercept('POST', '**/Dekart/UpdateReport').as('saveDuckDBDraft')
    const sql = 'SELECT source_version, longitude, latitude FROM datasets."Query 1" ORDER BY source_version'
    cy.get('textarea').type(sql, { force: true, parseSpecialCharSequences: false })
    cy.wait('@saveDuckDBDraft')
    cy.wait(750)
    cy.contains('.ace_editor:visible .ace_line', 'SELECT source_version').should('be.visible')

    cy.get('#dekart-query-status-message').should('be.empty')
    cy.contains('Datasets(1)').should('be.visible')
    cy.get('#dekart-query-execute-button').should('not.be.disabled')

    cy.reload()
    cy.contains('[role="tab"]', 'Query 2', { timeout: 30000 }).click({ force: true })
    cy.get('#dekart-query-status-message').should('be.empty')
    cy.contains('Datasets(1)', { timeout: 120000 }).should('be.visible')
  })

  it('allows a missing DuckDB dependency to be named and executed', () => {
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.contains('button', 'Run SQL').first().click()

    cy.get('button.ant-tabs-nav-add:visible').click()
    cy.contains('[role="tab"]', 'New').click({ force: true })
    selectDuckDBQuery()
    enterVisibleQuery('SELECT source_version FROM datasets."New"')
    cy.get('#dekart-query-execute-button').should('not.be.disabled').click()
    assertQueryStatus('Query Error')

    cy.contains('[role="tab"]', 'Query 1').click({ force: true })
    cy.get('span[title="Dataset setting"]').first().click()
    cy.get('#dekart-dataset-name-input').clear().type('New')
    cy.get('#dekart-save-dataset-name-button').click()
    cy.contains('[role="tab"]', 'New').should('be.visible')

    runBigQuery("SELECT 'recovered' AS source_version, 37.0 AS latitude, -122.0 AS longitude")
    cy.contains('[role="tab"]', 'Query 2').click({ force: true })
    assertQueryStatus('Ready', 300000)
    cy.assertDatasetTable('Query 2', ['source_version'], ['recovered'])
  })

  it('uses a BigQuery source that loaded before DuckDB was added', () => {
    createLoadedBigQuerySource()
    addDuckDBQuery('SELECT source_version, longitude, latitude FROM datasets."Query 1" ORDER BY source_version')

    cy.assertDatasetRows('Query 2', 1)
    cy.assertDatasetTable('Query 2', ['source_version', 'longitude', 'latitude'], ['loaded-first'])
  })

  it('binds DuckDB parameters in canonical order and ignores unapplied drafts', () => {
    cy.get('button#dekart-create-report').click()
    cy.contains('button', 'Run SQL').first().click()

    cy.intercept('POST', '**/Dekart/UpdateReport').as('saveParameterizedSource')
    enterVisibleQuery(`SELECT CONCAT({{B}}, '|', {{_x}}, '|', {{a}}) AS source_values,
      13.4 AS longitude, 52.5 AS latitude`)
    cy.wait('@saveParameterizedSource')

    queryParameterInput('B').clear().type('upper')
    queryParameterInput('_x').clear().type('underscore')
    queryParameterInput('a').clear().type('lower')
    cy.get('button[title="Apply query parameters"]').click()
    assertQueryStatus('Ready', 120000)

    addDuckDBQuery(`SELECT CONCAT(source_values, '=>', {{B}}, '|', {{_x}}, '|', {{a}}) AS binding,
      longitude, latitude FROM datasets."Query 1"`)
    cy.assertDatasetTable('Query 2', ['binding'], [
      'upper|underscore|lower=>upper|underscore|lower'
    ])

    queryParameterInput('B').clear().type('unapplied')
    cy.contains('[role="tab"]', 'Query 1').click({ force: true })
    runBigQuery(`SELECT CONCAT('refreshed:', {{B}}, '|', {{_x}}, '|', {{a}}) AS source_values,
      13.4 AS longitude, 52.5 AS latitude UNION ALL
      SELECT CONCAT('refreshed-again:', {{B}}, '|', {{_x}}, '|', {{a}}), 13.5, 52.6`)
    cy.contains('[role="tab"]', 'Query 2').click({ force: true })
    cy.assertDatasetRows('Query 2', 2)
    cy.assertDatasetTable('Query 2', ['binding'], [
      'refreshed:upper|underscore|lower=>upper|underscore|lower',
      'refreshed-again:upper|underscore|lower=>upper|underscore|lower'
    ])
  })
})
