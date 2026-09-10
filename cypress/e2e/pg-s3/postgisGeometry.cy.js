/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('pg-s3 PostGIS geometry', () => {
  it('renders raw PostGIS geometry without ST_AsGeoJSON', () => {
    cy.intercept('POST', '**/Dekart/RunQuery').as('runQuery')

    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('button#dekart-create-report', { timeout: 30000 }).click({ force: true })

    cy.get('.ace_editor:not(.ace_autocomplete):visible textarea, button:contains("Run SQL directly on Postgres")', { timeout: 30000 }).then(($elements) => {
      // Existing system connections can open the SQL editor without a source-selection step.
      if ($elements.filter('textarea').length > 0) return
      cy.wrap($elements.filter('button').first()).click({ force: true })
    })
    const postgisQuery = `WITH polygon AS (
      SELECT ST_MakeEnvelope(
        -118.08330882698346, 33.7756905,
        -118.06330882698346, 33.7956905,
        4326
      ) AS geom
    ), source AS (
      SELECT 1 AS geometry_order, geom AS geometry FROM polygon
      UNION ALL
      SELECT 2 AS geometry_order, ST_Multi(ST_Translate(geom, 0.03, 0)) AS geometry FROM polygon
    )
    SELECT geometry
    FROM source
    ORDER BY geometry_order`
    cy.enterQuery(postgisQuery)
    cy.get(`button:contains("${copy.execute}"):visible`).click()
    cy.wait('@runQuery', { timeout: 120000 }).its('response.statusCode').should('eq', 200)
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.get('div:contains("2 rows")', { timeout: 120000 }).should('be.visible')
    cy.get(`span:contains("${copy.downloading}")`, { timeout: 120000 }).should('contain', 'B')
    cy.get('.layer__title__type', { timeout: 120000 })
      .filter(':contains("geojson")')
      .should('have.length', 1)
      .and('be.visible')
    cy.get('.source-data-title .dataset-name').first().then($name => {
      const section = $name.closest('.source-data-title').parent().parent()
      section.find('.show-data-table svg')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    cy.get('#dataset-modal .header-cell[title="geometry"]', { timeout: 30000 }).should('be.visible')
    cy.get('#dataset-modal .cell.row-0').first()
      .should('have.attr', 'title')
      .and('match', /^0103000000/)
    cy.get('#dataset-modal .cell.row-1').first()
      .should('have.attr', 'title')
      .and('match', /^0106000000/)
    cy.get('.modal--close').click()
    cy.get('.mapboxgl-canvas').should('be.visible')
    cy.wait(2000)
  })
})
