/* eslint-disable no-undef */

// createReportAndUpload creates a report and waits for its uploaded source to load.
function createReportAndUpload (fixture) {
  cy.visit('http://localhost:3000/')
  cy.get('body', { timeout: 20000 }).then(($body) => {
    if ($body.text().includes('Ready to connect')) {
      cy.contains('button', 'Use file upload').click()
    } else {
      cy.get('button#dekart-create-report', { timeout: 20000 }).click()
    }
  })

  cy.contains('button', 'Upload File', { timeout: 20000 }).scrollIntoView().click({ force: true })
  cy.get('input[type="file"]', { timeout: 20000 }).selectFile(`cypress/fixtures/${fixture}`, { force: true })
  cy.contains('button', 'Upload').click()
  cy.contains('Ready', { timeout: 120000 }).should('be.visible')
}

// runActiveDuckDBQuery selects DuckDB and executes SQL for the active empty dataset.
function runActiveDuckDBQuery (sql) {
  cy.contains('button', 'DuckDB', { timeout: 20000 }).first().scrollIntoView().click({ force: true })
  cy.get('.ace_editor:visible textarea').focus().then($textarea => {
    const view = $textarea[0].ownerDocument.defaultView
    const clipboardData = new view.DataTransfer()
    clipboardData.setData('text/plain', sql)
    $textarea[0].dispatchEvent(new view.ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData
    }))
  }).wait(250)
  cy.get('#dekart-query-execute-button').click()
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
    addDuckDBQuery(
      'SELECT primary_type, latitude, longitude FROM datasets."sample.csv"',
      'Query 1',
      8276,
      ['primary_type', 'latitude', 'longitude'],
      ['THEFT']
    )
    addDuckDBQuery(
      'SELECT primary_type, count(*) AS total FROM datasets."Query 1" GROUP BY primary_type',
      'Query 2',
      29,
      ['primary_type', 'total']
    )
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
