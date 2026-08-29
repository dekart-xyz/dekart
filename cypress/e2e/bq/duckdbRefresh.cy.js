/* eslint-disable no-undef */

const CHICAGO_CRIME_SAMPLE_QUERY = 'SELECT primary_type, district, latitude, longitude, date FROM `bigquery-public-data.chicago_crime.crime` WHERE RAND() < 0.1 / 100.0'

// enterVisibleQuery pastes SQL atomically so autosave cannot interrupt a long sequence of keystrokes.
function enterVisibleQuery (sql) {
  cy.get('.ace_editor:visible textarea', { timeout: 30000 }).first()
    .focus()
    .type('{selectall}', { force: true })
    .then($textarea => {
      if (sql === '') {
        return cy.wrap($textarea).type('{backspace}', { force: true })
      }
      const view = $textarea[0].ownerDocument.defaultView
      const clipboardData = new view.DataTransfer()
      clipboardData.setData('text/plain', sql)
      $textarea[0].dispatchEvent(new view.ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData
      }))
    })
    .wait(250)
}

function saveVisibleQuery (sql, alias) {
  cy.intercept('POST', '**/Dekart/UpdateReport').as(alias)
  enterVisibleQuery(sql)
  cy.get('button[title="Save this map"]').should('not.be.disabled').click()
  cy.wait(`@${alias}`)
}

// assertQueryStatus verifies the status rendered below the selected query editor.
function assertQueryStatus (status, timeout = 60000) {
  cy.get('#dekart-query-status-message', { timeout }).should('contain', status)
}

function queryParameterInput (name) {
  return cy.contains('.ant-input-group-addon', name)
    .parent()
    .find('input')
    .first()
}

function openHistory () {
  cy.intercept('POST', '**/Dekart/GetSnapshots').as('getSnapshots')
  cy.contains('.ant-select-selection-item', 'Editing').click()
  cy.contains('History').click()
  cy.contains('.ant-modal-title', 'Map Change History').should('be.visible')
  cy.wait('@getSnapshots', { timeout: 30000 })
  cy.contains('.ant-modal:visible .ant-collapse-header-text', 'Today', { timeout: 30000 }).click()
  cy.get('.ant-modal:visible .ant-collapse-header').eq(1).click()
}

// assertDatasetIsNonEmpty verifies sampled warehouse data reached the visible dataset catalog.
function assertDatasetIsNonEmpty (label) {
  cy.contains('.source-data-title .dataset-name', label, { timeout: 120000 }).should($name => {
    const section = $name.closest('.source-data-title').parent().parent()
    expect(section.find('.source-data-rows').text()).to.match(/^[1-9][\d,]* rows$/)
  })
}

// assertQueryAndDatasetLabels verifies forked queries remain uniquely named in the visible UI.
function assertQueryAndDatasetLabels (labels) {
  cy.get('[role="tab"]').should($tabs => {
    const tabLabels = [...$tabs].map(tab => tab.textContent.trim())
    expect(tabLabels).to.deep.equal(labels)
  })
  cy.get('.source-data-title .dataset-name').should($names => {
    const datasetLabels = [...$names].map(name => name.textContent.trim())
    expect(datasetLabels).to.have.length(labels.length)
    expect([...datasetLabels].sort()).to.deep.equal([...labels].sort())
  })
}

// runBigQuery executes SQL and waits for the visible warehouse status to become ready.
function runBigQuery (sql) {
  enterVisibleQuery(sql)
  cy.get('#dekart-query-execute-button').click()
  assertQueryStatus('Ready', 120000)
}

// runDuckDBQuery executes SQL and waits for browser-local results to become visible.
function runDuckDBQuery (sql) {
  enterVisibleQuery(sql)
  cy.get('#dekart-query-execute-button').should('not.be.disabled').click()
  assertQueryStatus('Ready', 300000)
}

// addDuckDBQuery adds a DuckDB query using the dataset selector.
function addDuckDBQuery (sql) {
  cy.get('button.ant-tabs-nav-add:visible').click()
  cy.contains('[role="tab"]', 'New').click({ force: true })
  selectDuckDBQuery()
  runDuckDBQuery(sql)
}

// selectDuckDBQuery waits for the server-created query before interacting with its editor.
function selectDuckDBQuery () {
  cy.intercept('POST', '**/Dekart/CreateQuery').as('createDuckDBQuery')
  cy.contains('button', 'DuckDB', { timeout: 20000 }).should('be.visible').click()
  cy.wait('@createDuckDBQuery', { timeout: 30000 })
  cy.get('.ace_editor:visible textarea', { timeout: 30000 }).should('exist')
}

// createLoadedBigQuerySource makes the source visible before a DuckDB dataset exists.
function createLoadedBigQuerySource () {
  cy.visit('/')
  cy.get('button#dekart-create-report').click()
  cy.contains('button', 'Run SQL').first().click()
  runBigQuery("SELECT 'loaded-first' AS source_version, 13.4 AS longitude, 52.5 AS latitude")
  cy.assertDatasetRows('Query 1', 1)
}

function getCurrentReportId () {
  return cy.location('pathname').then(pathname => {
    const match = pathname.match(/^\/reports\/([0-9a-f-]+)/)
    expect(match, 'report path').not.to.equal(null)
    return match[1]
  })
}

// publishCurrentReport prepares public-viewer scenarios in the self-hosted BigQuery lane,
// where public-link controls are intentionally not rendered.
function publishCurrentReport () {
  getCurrentReportId().then(reportId => {
    cy.psql(`UPDATE reports SET is_public=TRUE WHERE id='${reportId}'`)
  })
}

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

    enterVisibleQuery('datasets')
    cy.get('.ace_editor:visible textarea').type('.', { force: true })
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
    cy.get('#dekart-query-execute-button').click()
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
    cy.contains('button', 'Write README').click()

    cy.contains('.ant-tabs-tab', 'Readme', { timeout: 30000 }).should('be.visible')
    cy.get('[role="tab"]').filter(':contains("New")').should('have.length', 1)
    cy.contains('[role="tab"]', 'Query 2').click({ force: true })
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
