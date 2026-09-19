/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

const POINT_LAYER_TYPE_SELECTOR = '.layer__title__type:contains("point")'

// Keep refresh fixtures identical except for the selected category's presence and count.
const widgetQuery = ({ firstCategory = 0, typeZeroRows = 10 } = {}) => `
  SELECT
    FORMAT('TYPE_%02d', category) AS primary_type,
    41 + (category * 100 + occurrence) / 10000 AS latitude,
    -87 - (category * 100 + occurrence) / 10000 AS longitude
  FROM UNNEST(GENERATE_ARRAY(${firstCategory}, 27)) AS category
  CROSS JOIN UNNEST(GENERATE_ARRAY(1, IF(category = 0, ${typeZeroRows}, 10))) AS occurrence
`

describe('update dataset', () => {
  it('keeps category filters linked to widgets when query data reloads', () => {
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.get('button:contains("Run SQL")').last().click()
    cy.enterQuery(widgetQuery({ typeZeroRows: 20 }))
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')
    cy.get('[data-testid="widgets-tab"]', { timeout: 120000 }).then(button => {
      if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
    })
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '290')

    cy.contains('[data-testid="category-chart"] g[aria-label="text"][data-index="2"] text', 'TYPE_00').then(label => {
      const labels = [...label[0].parentElement.querySelectorAll('text')]
      cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').eq(labels.indexOf(label[0])).click()
    })
    cy.get('[data-testid="number-value"]').should('have.text', '20')
    cy.get('[data-testid="filter-strip"]', { timeout: 30000 }).should('contain.text', 'primary type')

    let delayNextRun = true
    cy.intercept('POST', '**/Dekart/RunQuery', request => {
      // Hold one Execute long enough to expose transient dataset clearing during a real reload.
      if (delayNextRun) {
        delayNextRun = false
        return Cypress.Promise.delay(3000).then(() => request.continue())
      }
      request.continue()
    })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`button:contains("${copy.cancel}")`).should('be.visible')
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')
    cy.get('[data-testid="filter-strip"]', { timeout: 30000 }).should('contain.text', 'primary type')
    cy.get('[data-testid="number-value"]').should('have.text', '20')

    cy.intercept('GET', '**/api/v1/dataset-source/**').as('refreshedDatasetSource')
    cy.get('button#dekart-refresh-button').click()
    cy.get('#dekart-refresh-now-button').click()
    cy.get('button#dekart-refresh-button .anticon-loading', { timeout: 30000 }).should('exist')
    cy.get('button#dekart-refresh-button .anticon-loading', { timeout: 120000 }).should('not.exist')
    cy.wait('@refreshedDatasetSource', { timeout: 120000 })
    cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')
    cy.get('[data-testid="filter-strip"]', { timeout: 30000 }).should('contain.text', 'primary type')
    cy.get('[data-testid="number-value"]').should('have.text', '20')

    cy.enterQuery(widgetQuery({ typeZeroRows: 21 }))
    cy.intercept('GET', '**/api/v1/dataset-source/**').as('changedDatasetSource')
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`button:contains("${copy.cancel}")`).should('be.visible')
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.wait('@changedDatasetSource', { timeout: 120000 })
    cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')
    cy.get('[data-testid="filter-strip"]', { timeout: 30000 }).should('contain.text', 'primary type')
    cy.get('[data-testid="number-value"]').should('have.text', '21')

    cy.enterQuery(widgetQuery({ firstCategory: 1 }))
    cy.intercept('GET', '**/api/v1/dataset-source/**').as('removedCategoryDatasetSource')
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`button:contains("${copy.cancel}")`).should('be.visible')
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.wait('@removedCategoryDatasetSource', { timeout: 120000 })
    cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')
    cy.get('[data-testid="filter-strip"]', { timeout: 30000 }).should('contain.text', 'No filters')
    cy.get('[data-testid="number-value"]').should('have.text', '270')
  })

  it('should persist kepler config when updating dataset', () => {
    // create report
    cy.visit('/')
    cy.get('button#dekart-create-report').click()

    // Persist and reopen the blank dataset before its first result is published.
    cy.intercept('POST', '**/Dekart/UpdateReport').as('saveBlankMap')
    cy.get('button#dekart-save-button').click()
    cy.wait('@saveBlankMap', { timeout: 60000 })
    cy.reload()

    // first query
    cy.get('button:contains("Run SQL")').last().click()
    cy.enterQuery('SELECT primary_type, district, latitude, longitude, date from `bigquery-public-data.chicago_crime.crime` limit 1')
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')
    cy.openLayerPanel()
    cy.get('[data-testid="map-settings-tab"]').click()
    cy.get(POINT_LAYER_TYPE_SELECTOR, { timeout: 20000 }).should('have.length', 1)

    // second query
    cy.get('button.ant-tabs-nav-add:visible').click()
    cy.get('button:contains("Run SQL")').last().click()
    cy.enterQuery('SELECT primary_type, district, latitude, longitude, date from `bigquery-public-data.chicago_crime.crime` limit 2')
    cy.intercept('GET', '**/api/v1/dataset-source/**').as('secondDatasetSource')
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`button:contains("${copy.cancel}")`).should('be.visible')
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.wait('@secondDatasetSource', { timeout: 120000 })
    cy.contains('Downloading Map Data', { timeout: 120000 }).should('not.exist')

    // two layers in kepler
    cy.get('[data-testid="map-settings-tab"]').click()
    cy.get(POINT_LAYER_TYPE_SELECTOR, { timeout: 20000 }).should('have.length', 2)

    // update second query
    cy.enterQuery('SELECT primary_type, district, latitude, longitude, date from `bigquery-public-data.chicago_crime.crime` limit 3')
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`button:contains("${copy.cancel}")`).should('be.visible')
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')

    // kepler config preserved
    cy.get('[data-testid="map-settings-tab"]').click()
    cy.get('div:contains("3 rows")', { timeout: 20000 }).should('be.visible')
    cy.get(POINT_LAYER_TYPE_SELECTOR).should('have.length', 2)
  })
})
