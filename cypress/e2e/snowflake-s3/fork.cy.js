/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('fork', () => {
  it('should have same viz style after fork', () => {
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.get('button:contains("Add data from...")').click()
    cy.get('span:contains("SQL query")').click()
    cy.get('textarea').type('select 0 as lat, 0 as lon', { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get('div:contains("1 rows")', { timeout: 20000 }).should('be.visible')

    cy.get('span[title="Dataset setting"]').click()
    cy.get('input#dekart-dataset-name-input').should('be.visible')
    const randomDatasetName = `test-${Math.floor(Math.random() * 1000000)}`
    cy.get('input#dekart-dataset-name-input').type(randomDatasetName)
    cy.get('button#dekart-save-dataset-name-button').click()
    cy.get(`span:contains("${randomDatasetName}")`).should('be.visible')
    cy.get('button#dekart-fork-button').click()
    cy.get('span:contains("Fork of Untitled")').should('be.visible')
    cy.get('div:contains("1 rows")', { timeout: 20000 }).should('be.visible')
    cy.get(`span:contains("${randomDatasetName}")`).should('be.visible')
  })
})
