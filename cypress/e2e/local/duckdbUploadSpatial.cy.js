/* eslint-disable no-undef */
import { createReportAndUpload, runActiveDuckDBQuery, addDuckDBQuery } from './duckdbHelpers'

describe('browser-local DuckDB upload and spatial datasets', () => {
  it('loads a CSV row longer than DuckDB default max line size', () => {
    const coordinates = Array.from({ length: 60000 }, (_, i) => `[ ${(-115.26 + i * 1e-7).toExponential(15)}, ${(36.15 + i * 1e-7).toExponential(15)} ]`).join(', ')
    const geometry = `{ "coordinates": [ ${coordinates} ], "type": "LineString" }`
    createReportAndUpload({
      contents: Cypress.Buffer.from(`name,geometry\nlong-road,"${geometry.replaceAll('"', '""')}"\n`),
      fileName: 'long-line.csv',
      mimeType: 'text/csv'
    })
    cy.waitForMapSettingsEnabled()
    cy.assertDatasetRows('long-line.csv', 1)
  })

  it('reports a CSV row above the line size limit without dumping the row', () => {
    const coordinates = Array.from({ length: 450000 }, (_, i) => `[ ${(-115.26 + i * 1e-8).toExponential(15)}, ${(36.15 + i * 1e-8).toExponential(15)} ]`).join(', ')
    const geometry = `{ "coordinates": [ ${coordinates} ], "type": "LineString" }`
    createReportAndUpload({
      contents: Cypress.Buffer.from(`name,geometry\ntoo-long-road,"${geometry.replaceAll('"', '""')}"\n`),
      fileName: 'too-long-line.csv',
      mimeType: 'text/csv'
    })
    cy.contains('.ant-message-notice', 'CSV row exceeds 20 MB limit', { timeout: 120000 }).should('be.visible')
    cy.get('.ant-message-notice').should('not.contain', 'Original Line')
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

  it('clusters uploaded points into H3 cells and visualizes them in Kepler', () => {
    createReportAndUpload('h3-points.csv')
    addDuckDBQuery(
      `SELECT
        h3_latlng_to_cell_string(latitude, longitude, 8) AS h3,
        count(*) AS point_count,
        json_extract_string(json_object('source', 'points'), '$.source') AS source
      FROM datasets."h3-points.csv"
      GROUP BY h3, source
      ORDER BY h3`,
      'Query 1',
      2,
      ['h3', 'point_count', 'source'],
      ['points']
    )
    cy.contains('.layer__title__type', 'H3', { timeout: 120000 }).should('be.visible')
    cy.get('.mapboxgl-canvas', { timeout: 30000 }).should($canvas => {
      const bounds = $canvas[0].getBoundingClientRect()
      expect(bounds.width, 'map width').to.be.greaterThan(0)
      expect(bounds.height, 'map height').to.be.greaterThan(0)
    })
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
