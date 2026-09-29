/* eslint-disable no-undef */

export const LAYER_SELECTOR = '[data-testid="sortable-layer-item"], [data-testid="static-layer-item"]'

// createReport opens a new empty report through the available local entry point.
export function createReport () {
  cy.visit('/')
  cy.get('body', { timeout: 20000 }).then(($body) => {
    if ($body.text().includes('Ready to connect')) {
      cy.contains('button', 'Use file upload').click()
    } else {
      cy.get('button#dekart-create-report', { timeout: 20000 }).click()
    }
  })
}

// uploadActiveDataset selects a fixture path or generated file for the active empty dataset and waits for storage.
export function uploadActiveDataset (fixture) {
  const [file, fileName] = typeof fixture === 'string'
    ? [`cypress/fixtures/${fixture}`, fixture]
    : [fixture, fixture.fileName]
  cy.contains('button', 'Upload File', { timeout: 20000 }).scrollIntoView().click({ force: true })
  cy.intercept('POST', '**/api/v1/file/*/upload-sessions/*/complete').as('completeUploadSession')
  cy.get('input[type="file"]', { timeout: 20000 }).selectFile(file, { force: true })
  cy.contains('button', 'Upload').click()
  cy.wait('@completeUploadSession', { timeout: 120000 })
  cy.contains('Ready', { timeout: 120000 }).should('be.visible')
  cy.contains(fileName, { timeout: 20000 }).should('be.visible')
}

// createReportAndUpload creates a report and waits for its uploaded source to load.
export function createReportAndUpload (fixture) {
  createReport()
  uploadActiveDataset(fixture)
}

// selectDuckDB chooses the browser-local query engine and verifies its supplied logo.
export function selectDuckDB () {
  cy.contains('button', 'DuckDB', { timeout: 20000 }).as('duckDBButton')
  cy.get('@duckDBButton').find('.anticon').should('have.css', 'background-image').and('include', 'Ebene_1')
  cy.get('@duckDBButton').scrollIntoView().click({ force: true })
}

// replaceEditorText replaces the visible Ace value through its keyboard input.
export function replaceEditorText (sql) {
  cy.intercept('POST', '**/Dekart/UpdateReport').as('saveDuckDBEditor')
  cy.get('.ace_editor:not(.ace_autocomplete):visible').then($editor => {
    const editor = $editor[0].ownerDocument.defaultView.ace.edit($editor[0])
    editor.completer?.detach()
    editor.focus()
  })
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
  cy.wait('@saveDuckDBEditor', { timeout: 60000 }).its('response.statusCode').should('eq', 200)
  editorShouldContain(sql)
}

// editorShouldContain asserts the visible Ace editor's current SQL value.
export function editorShouldContain (sql) {
  cy.get('.ace_editor:not(.ace_autocomplete):visible').should($editor => {
    const editor = $editor[0].ownerDocument.defaultView.ace.edit($editor[0])
    assert.include(editor.getValue(), sql)
  })
}

// acceptAutocomplete inserts a named suggestion through Ace's completion path.
export function acceptAutocomplete (completion) {
  cy.intercept('POST', '**/Dekart/UpdateReport').as('saveDuckDBAutocomplete')
  cy.get('.ace_autocomplete:visible', { timeout: 20000 }).should('contain.text', completion)
  cy.get('.ace_editor:not(.ace_autocomplete):visible').then(($editor) => {
    const editor = $editor[0].ownerDocument.defaultView.ace.edit($editor[0])
    const match = editor.completer.completions.filtered.find(candidate => candidate.caption === completion)
    expect(match, `autocomplete match for ${completion}`).to.not.equal(undefined)
    editor.completer.insertMatch(match)
  })
  cy.wait('@saveDuckDBAutocomplete', { timeout: 60000 }).its('response.statusCode').should('eq', 200)
}

// insertSampleQuery opens the default example and verifies its visible SQL.
export function insertSampleQuery (sql) {
  cy.intercept('POST', '**/Dekart/UpdateReport').as('saveDuckDBSampleQuery')
  cy.contains('button', 'Start with a sample query').click()
  editorShouldContain(sql)
  cy.wait('@saveDuckDBSampleQuery', { timeout: 60000 }).its('response.statusCode').should('eq', 200)
  editorShouldContain(sql)
}

// runActiveDuckDBQuery selects DuckDB and executes SQL for the active empty dataset.
export function runActiveDuckDBQuery (sql) {
  selectDuckDB()
  replaceEditorText(sql)
  cy.get('#dekart-query-execute-button', { timeout: 20000 }).should('be.enabled').click()
  cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
}

// addDuckDBQuery creates, executes, and verifies a browser-local query in the UI.
export function addDuckDBQuery (sql, datasetLabel, expectedRows, expectedFields, expectedValues = []) {
  cy.get('button.ant-tabs-nav-add:visible').first().click()
  cy.contains('[role="tab"]', 'New').click({ force: true })
  cy.intercept('POST', '**/Dekart/UpdateReport').as('duckdbMapUpdate')
  runActiveDuckDBQuery(sql)
  cy.assertDatasetRows(datasetLabel, expectedRows)
  // Kepler persists the visible dataset/layer update asynchronously. Wait for the
  // public API save and its immediately-following layer reconciliation to settle
  // before opening the data-table modal that a report refresh can otherwise close.
  cy.wait('@duckdbMapUpdate', { timeout: 120000 }).its('response.statusCode').should('eq', 200)
  cy.assertDatasetTable(datasetLabel, expectedFields, expectedValues)
}
