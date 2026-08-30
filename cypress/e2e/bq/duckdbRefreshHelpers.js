/* eslint-disable no-undef */

export const CHICAGO_CRIME_SAMPLE_QUERY = 'SELECT primary_type, district, latitude, longitude, date FROM `bigquery-public-data.chicago_crime.crime` WHERE RAND() < 0.1 / 100.0'

// enterVisibleQuery pastes SQL atomically so autosave cannot interrupt a long sequence of keystrokes.
export function enterVisibleQuery (sql) {
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

export function saveVisibleQuery (sql, alias) {
  cy.intercept('POST', '**/Dekart/UpdateReport').as(alias)
  enterVisibleQuery(sql)
  cy.get('button[title="Save this map"]').should('not.be.disabled').click()
  cy.wait(`@${alias}`)
}

// assertQueryStatus verifies the status rendered below the selected query editor.
export function assertQueryStatus (status, timeout = 60000) {
  cy.get('#dekart-query-status-message', { timeout }).should('contain', status)
}

export function queryParameterInput (name) {
  return cy.contains('.ant-input-group-addon', name)
    .parent()
    .find('input')
    .first()
}

export function openHistory () {
  cy.intercept('POST', '**/Dekart/GetSnapshots').as('getSnapshots')
  cy.contains('.ant-select-selection-item', 'Editing').click()
  cy.contains('History').click()
  cy.contains('.ant-modal-title', 'Map Change History').should('be.visible')
  cy.wait('@getSnapshots', { timeout: 30000 })
  cy.contains('.ant-modal:visible .ant-collapse-header-text', 'Today', { timeout: 30000 }).click()
  cy.get('.ant-modal:visible .ant-collapse-header').eq(1).click()
}

// assertDatasetIsNonEmpty verifies sampled warehouse data reached the visible dataset catalog.
export function assertDatasetIsNonEmpty (label) {
  cy.contains('.source-data-title .dataset-name', label, { timeout: 120000 }).should($name => {
    const section = $name.closest('.source-data-title').parent().parent()
    expect(section.find('.source-data-rows').text()).to.match(/^[1-9][\d,]* rows$/)
  })
}

// assertQueryAndDatasetLabels verifies forked queries remain uniquely named in the visible UI.
export function assertQueryAndDatasetLabels (labels) {
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
export function runBigQuery (sql) {
  enterVisibleQuery(sql)
  cy.get('#dekart-query-execute-button').click()
  assertQueryStatus('Ready', 120000)
}

// runDuckDBQuery executes SQL and waits for browser-local results to become visible.
export function runDuckDBQuery (sql) {
  enterVisibleQuery(sql)
  cy.get('#dekart-query-execute-button').should('not.be.disabled').click()
  assertQueryStatus('Ready', 300000)
}

// addDuckDBQuery adds a DuckDB query using the dataset selector.
export function addDuckDBQuery (sql) {
  cy.get('button.ant-tabs-nav-add:visible').click()
  cy.contains('[role="tab"]', 'New').click({ force: true })
  selectDuckDBQuery()
  runDuckDBQuery(sql)
}

// selectDuckDBQuery waits for the server-created query before interacting with its editor.
export function selectDuckDBQuery () {
  cy.intercept('POST', '**/Dekart/CreateQuery').as('createDuckDBQuery')
  cy.contains('button', 'DuckDB', { timeout: 20000 }).should('be.visible').click()
  cy.wait('@createDuckDBQuery', { timeout: 30000 })
  cy.get('.ace_editor:visible textarea', { timeout: 30000 }).should('exist')
}

// createLoadedBigQuerySource makes the source visible before a DuckDB dataset exists.
export function createLoadedBigQuerySource () {
  cy.visit('/')
  cy.get('button#dekart-create-report').click()
  cy.contains('button', 'Run SQL').first().click()
  runBigQuery("SELECT 'loaded-first' AS source_version, 13.4 AS longitude, 52.5 AS latitude")
  cy.assertDatasetRows('Query 1', 1)
}

export function getCurrentReportId () {
  return cy.location('pathname').then(pathname => {
    const match = pathname.match(/^\/reports\/([0-9a-f-]+)/)
    expect(match, 'report path').not.to.equal(null)
    return match[1]
  })
}

// publishCurrentReport prepares public-viewer scenarios in the self-hosted BigQuery lane,
// where public-link controls are intentionally not rendered.
export function publishCurrentReport () {
  getCurrentReportId().then(reportId => {
    cy.psql(`UPDATE reports SET is_public=TRUE WHERE id='${reportId}'`)
  })
}
