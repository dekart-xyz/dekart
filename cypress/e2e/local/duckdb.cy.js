/* eslint-disable no-undef */

// createReport opens a new empty report through the available local entry point.
function createReport () {
  cy.visit('http://localhost:3000/')
  cy.get('body', { timeout: 20000 }).then(($body) => {
    if ($body.text().includes('Ready to connect')) {
      cy.contains('button', 'Use file upload').click()
    } else {
      cy.get('button#dekart-create-report', { timeout: 20000 }).click()
    }
  })
}

// uploadActiveDataset selects a file for the active empty dataset and waits for storage.
function uploadActiveDataset (fixture) {
  cy.contains('button', 'Upload File', { timeout: 20000 }).scrollIntoView().click({ force: true })
  cy.intercept('POST', '**/api/v1/file/*/upload-sessions/*/complete').as('completeUploadSession')
  cy.get('input[type="file"]', { timeout: 20000 }).selectFile(`cypress/fixtures/${fixture}`, { force: true })
  cy.contains('button', 'Upload').click()
  cy.wait('@completeUploadSession', { timeout: 120000 })
  cy.contains('Ready', { timeout: 120000 }).should('be.visible')
  cy.contains(fixture, { timeout: 20000 }).should('be.visible')
}

// createReportAndUpload creates a report and waits for its uploaded source to load.
function createReportAndUpload (fixture) {
  createReport()
  uploadActiveDataset(fixture)
}

// selectDuckDB chooses the browser-local query engine and verifies its supplied logo.
function selectDuckDB () {
  cy.contains('button', 'DuckDB', { timeout: 20000 }).as('duckDBButton')
  cy.get('@duckDBButton').find('.anticon').should('have.css', 'background-image').and('include', 'Ebene_1')
  cy.get('@duckDBButton').scrollIntoView().click({ force: true })
}

// replaceEditorText replaces the visible Ace value through its keyboard input.
function replaceEditorText (sql) {
  cy.get('.ace_editor:not(.ace_autocomplete):visible textarea').focus().type('{esc}', { force: true })
  cy.get('.ace_autocomplete:visible').should('not.exist')
  cy.get('.ace_editor:not(.ace_autocomplete):visible textarea').type('{selectall}{backspace}', { force: true })
  cy.get('.ace_editor:not(.ace_autocomplete):visible .ace_content').should($content => {
    expect($content.text().trim()).to.equal('')
  })
  cy.get('.ace_editor:not(.ace_autocomplete):visible textarea').then($textarea => {
    const view = $textarea[0].ownerDocument.defaultView
    const clipboardData = new view.DataTransfer()
    clipboardData.setData('text/plain', sql)
    $textarea[0].dispatchEvent(new view.ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData
    }))
  })
  editorShouldContain(sql)
}

// editorShouldContain asserts the SQL rendered by the visible Ace editor.
function editorShouldContain (sql) {
  cy.get('.ace_editor:not(.ace_autocomplete):visible .ace_content').should('contain.text', sql)
}

// acceptAutocomplete inserts a named suggestion through Ace's completion path.
function acceptAutocomplete (completion) {
  cy.get('.ace_autocomplete:visible', { timeout: 20000 }).should('contain.text', completion)
  cy.get('.ace_editor:not(.ace_autocomplete):visible').then(($editor) => {
    const editor = $editor[0].ownerDocument.defaultView.ace.edit($editor[0])
    const match = editor.completer.completions.filtered.find(candidate => candidate.caption === completion)
    expect(match, `autocomplete match for ${completion}`).to.exist
    editor.completer.insertMatch(match)
  })
}

// insertSampleQuery opens the default example and verifies its visible SQL.
function insertSampleQuery (sql) {
  cy.contains('button', 'Start with a sample query').click()
  editorShouldContain(sql)
}

// runActiveDuckDBQuery selects DuckDB and executes SQL for the active empty dataset.
function runActiveDuckDBQuery (sql) {
  selectDuckDB()
  replaceEditorText(sql)
  cy.get('#dekart-query-execute-button', { timeout: 20000 }).should('be.enabled').click()
  cy.get('#dekart-query-status-message', { timeout: 300000 }).should('contain', 'Ready')
}

// addDuckDBQuery creates, executes, and verifies a browser-local query in the UI.
function addDuckDBQuery (sql, datasetLabel, expectedRows, expectedFields, expectedValues = []) {
  cy.get('button.ant-tabs-nav-add:visible').first().click()
  cy.contains('[role="tab"]', 'New').click({ force: true })
  cy.intercept('POST', '**/Dekart/UpdateReport').as('duckdbMapUpdate')
  runActiveDuckDBQuery(sql)
  cy.assertDatasetRows(datasetLabel, expectedRows)
  // Kepler persists the visible dataset/layer update asynchronously. Wait for the
  // public API save and its immediately-following layer reconciliation to settle
  // before opening the data-table modal that a report refresh can otherwise close.
  cy.wait('@duckdbMapUpdate', { timeout: 120000 }).its('response.statusCode').should('eq', 200)
  cy.wait(2000)
  cy.assertDatasetTable(datasetLabel, expectedFields, expectedValues)
}

describe('browser-local DuckDB datasets', () => {
  it('queries an uploaded CSV and a chained DuckDB result', () => {
    createReportAndUpload('sample.csv')

    cy.get('button.ant-tabs-nav-add:visible').first().click()
    cy.contains('[role="tab"]', 'New').click({ force: true })
    selectDuckDB()
    insertSampleQuery('FROM datasets."sample.csv"')
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 300000 }).should('contain', 'Ready')
    cy.assertDatasetRows('Query 1', 100)

    cy.get('button.ant-tabs-nav-add:visible').first().click()
    cy.contains('[role="tab"]', 'New').click({ force: true })
    selectDuckDB()
    cy.get('.ace_editor:not(.ace_autocomplete):visible textarea').type('DATASETS', { force: true }).type('.', { force: true })
    cy.get('.ace_autocomplete:visible', { timeout: 20000 }).should('contain.text', 'sample.csv').and('contain.text', 'Query 1')
    acceptAutocomplete('sample.csv')
    editorShouldContain('DATASETS."sample.csv"')
    replaceEditorText('SELECT primary_type, latitude, longitude FROM datasets."sample.csv"')
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 300000 }).should('contain', 'Ready')
    cy.assertDatasetRows('Query 2', 8276)

    addDuckDBQuery(
      'SELECT primary_type, count(*) AS total FROM datasets."Query 2" GROUP BY primary_type',
      'Query 3',
      29,
      ['primary_type', 'total']
    )
  })

  it('generates points when no existing query can be pinned', () => {
    createReport()
    selectDuckDB()
    insertSampleQuery('FROM range(100)')
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 300000 }).should('contain', 'Ready')
    cy.assertDatasetTable('Query 1', ['latitude', 'longitude'])
    cy.assertDatasetRows('Query 1', 100)
  })

  it('quotes dataset labels and skips failed sources in the default example', () => {
    createReport()
    selectDuckDB()
    replaceEditorText('SELECT unknown_function(1)')
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 300000 }).should('contain', 'Query Error')

    cy.get('button.ant-tabs-nav-add:visible').first().click()
    cy.contains('[role="tab"]', 'New').click({ force: true })
    uploadActiveDataset('sample.csv')
    cy.get('.ant-message-notice', { timeout: 20000 }).should('not.exist')
    cy.get('.ant-tabs-tab-active .ant-tabs-tab-remove').click()
    cy.get('#dekart-dataset-name-input').type('source "one"')
    cy.get('#dekart-save-dataset-name-button').click()
    cy.get('#dekart-dataset-name-input', { timeout: 20000 }).should('not.exist')

    cy.get('button.ant-tabs-nav-add:visible').first().click()
    cy.contains('[role="tab"]', 'New').click({ force: true })
    selectDuckDB()
    cy.get('.ace_editor:not(.ace_autocomplete):visible textarea').type('datasets', { force: true }).type('.', { force: true })
    acceptAutocomplete('source "one"')
    editorShouldContain('datasets."source ""one"""')
    replaceEditorText('datasets."source ')
    cy.get('.ace_editor:not(.ace_autocomplete):visible textarea').type('o', { force: true })
    acceptAutocomplete('source "one"')
    editorShouldContain('datasets."source ""one"""')
    replaceEditorText('')
    insertSampleQuery('FROM datasets."source ""one"""')
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 300000 }).should('contain', 'Ready')

    replaceEditorText('')
    cy.get('.ant-message-notice', { timeout: 20000 }).should('not.exist')
    cy.get('.ant-tabs-tab-active .ant-tabs-tab-remove').click()
    cy.get('#dekart-dataset-name-input').type('source "one"')
    cy.get('#dekart-save-dataset-name-button').click()
    cy.get('#dekart-dataset-name-input', { timeout: 20000 }).should('not.exist')
    cy.get('.ace_editor:not(.ace_autocomplete):visible textarea').type('datasets', { force: true }).type('.', { force: true })
    cy.get('body').should($body => {
      expect($body.find('.ace_autocomplete:visible').text()).not.to.include('source "one"')
    })
    replaceEditorText('')
    insertSampleQuery('FROM range(100)')
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 300000 }).should('contain', 'Ready')
  })

  it('queries GeoJSON through the bundled spatial extension', () => {
    createReportAndUpload('sample.geojson')
    addDuckDBQuery(
      'SELECT name, ST_X(ST_GeomFromWKB(_geojson)) AS longitude, ST_Y(ST_GeomFromWKB(_geojson)) AS latitude FROM datasets."sample.geojson"',
      'Query 1',
      2,
      ['name', 'longitude', 'latitude']
    )
  })

  it('queries an uploaded Parquet file', () => {
    createReportAndUpload('sample.parquet')
    addDuckDBQuery(
      'SELECT primary_type, latitude, longitude FROM datasets."sample.parquet"',
      'Query 1',
      8276,
      ['primary_type', 'latitude', 'longitude'],
      ['THEFT']
    )
  })

  it('numbers queries by dataset order when they are created out of order', () => {
    createReportAndUpload('sample.csv')
    cy.get('button.ant-tabs-nav-add:visible').first().click()
    cy.get('[role="tab"]').filter(':contains("New")').should('have.length', 1)
    cy.get('button.ant-tabs-nav-add:visible').first().click()
    cy.get('[role="tab"]').filter(':contains("New")').should('have.length', 2)

    runActiveDuckDBQuery('SELECT primary_type FROM datasets."sample.csv" LIMIT 1')
    cy.get('[role="tab"]').filter(':contains("New")').click({ force: true })
    runActiveDuckDBQuery('SELECT primary_type FROM datasets."sample.csv" LIMIT 1')

    cy.get('[role="tab"]').should($tabs => {
      const queryLabels = [...$tabs].map(tab => tab.textContent.trim()).filter(label => label.startsWith('Query '))
      expect(queryLabels).to.deep.equal(['Query 1', 'Query 2'])
    })
  })
})
