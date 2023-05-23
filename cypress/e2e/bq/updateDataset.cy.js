/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('basic query flow', () => {
  it('should make simple bigquery query and get ready status', () => {
    cy.visit('/')
    cy.get(`button:contains("${copy.create_report}")`).click()
    cy.get(`button:contains("${copy.bigquery_query}")`).click()
    cy.get('textarea').type('SELECT primary_type, district, latitude, longitude, date from `bigquery-public-data.chicago_crime.crime` limit 1', { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')
    cy.get('#dekart-report-page-tabs button.ant-tabs-nav-add').click({ multiple: true, force: true })
    cy.get(`button:contains("${copy.bigquery_query}")`).click()
    cy.get('textarea').type('SELECT primary_type, district, latitude, longitude, date from `bigquery-public-data.chicago_crime.crime` limit 2', { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')
    cy.get('input[value="Point"]:visible', { timeout: 20000 }).should('have.length', 2)

    cy.get('textarea:first').clear({ force: true })
    cy.get('textarea:first').type('SELECT primary_type, district, latitude, longitude, date from `bigquery-public-data.chicago_crime.crime` limit 3', { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get(`button:contains("${copy.cancel}")`).should('be.visible')
    cy.get(`span:contains("${copy.ready}")`, { timeout: 20000 }).should('be.visible')
    cy.get('div:contains("3 rows")', { timeout: 20000 }).should('be.visible')
    cy.get('div:contains("1 rows")').should('be.visible')
    cy.get('input[value="Point"]:visible').should('have.length', 2)
  })
})
