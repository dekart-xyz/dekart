/* global cy */

describe('visit main page', () => {
  it('make simple bigquery query', () => {
    cy.visit('/')
    cy.get('button:contains("Create Report")').click()
    cy.get('button:contains("BigQuery query")').click()
    cy.get('textarea').type('select geometry from`bigquery-public-data.geo_openstreetmap.planet_features_multipolygons` limit 10', { force: true })
    cy.get('button:contains("Execute")').click()
    cy.get('span:contains("Ready")', { timeout: 20000 }).should('be.visible')
  })
})
