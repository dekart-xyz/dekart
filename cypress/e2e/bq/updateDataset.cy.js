/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('update dataset', () => {
  it('should persist kepler config when updating dataset', () => {
    // create report
    cy.visit('/')
    cy.get('button#dekart-create-report').click()

    // first query
    cy.get('button:contains("Run SQL")').click()
    cy.get('textarea').type('SELECT primary_type, district, latitude, longitude, date from `bigquery-public-data.chicago_crime.crime` limit 1', { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')

    // second query
    cy.get('button.ant-tabs-nav-add:visible').click()
    cy.get('button:contains("Run SQL")').click()
    cy.get('textarea').type('SELECT primary_type, district, latitude, longitude, date from `bigquery-public-data.chicago_crime.crime` limit 2', { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')

    // two layers in kepler
    cy.get('input[value="point"]:visible', { timeout: 20000 }).should('have.length', 2)

    // update second query
    cy.get('textarea:first').clear({ force: true })
    cy.get('textarea:first').invoke('val', '')
    cy.get('textarea:first').type('SELECT primary_type, district, latitude, longitude, date from `bigquery-public-data.chicago_crime.crime` limit 3', { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`button:contains("${copy.cancel}")`).should('be.visible')
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')

    // kepler config preserved
    cy.get('div:contains("3 rows")', { timeout: 20000 }).should('be.visible')
    cy.get('div:contains("1 rows")').should('be.visible')
    cy.get('input[value="point"]:visible').should('have.length', 2)
  })
})
