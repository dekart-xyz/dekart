/* eslint-disable no-undef */
import { LAYER_SELECTOR, createReport, createReportAndUpload, uploadActiveDataset, selectDuckDB, replaceEditorText, editorShouldContain, acceptAutocomplete, insertSampleQuery, runActiveDuckDBQuery, addDuckDBQuery } from './duckdbHelpers'

describe('browser-local DuckDB datasets', () => {
  it('queries an uploaded CSV and a chained DuckDB result', () => {
    createReportAndUpload('sample.csv')

    cy.get('button.ant-tabs-nav-add:visible').first().click()
    cy.contains('[role="tab"]', 'New').click({ force: true })
    selectDuckDB()
    insertSampleQuery('FROM datasets."sample.csv"')
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.assertDatasetRows('Query 1', 100)

    cy.get('button.ant-tabs-nav-add:visible').first().click()
    cy.contains('[role="tab"]', 'New').click({ force: true })
    selectDuckDB()
    cy.get('.ace_editor:not(.ace_autocomplete):visible textarea').type('DATASETS', { force: true }).type('.', { force: true })
    cy.get('.ace_autocomplete:visible', { timeout: 20000 }).should('contain.text', 'sample.csv').and('contain.text', 'Query 1')
    acceptAutocomplete('sample.csv')
    editorShouldContain('DATASETS."sample.csv"')
    replaceEditorText('SELECT primary_type, latitude, longitude FROM datasets."sample.csv"')
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.assertDatasetRows('Query 2', 8276)

    addDuckDBQuery(
      'SELECT primary_type, count(*) AS total FROM datasets."Query 2" GROUP BY primary_type',
      'Query 3',
      29,
      ['primary_type', 'total']
    )
  })

  it('keeps a zero-row first result eligible for later point inference', () => {
    createReport()
    runActiveDuckDBQuery('SELECT i::DOUBLE AS latitude, i::DOUBLE AS longitude FROM range(0) t(i)')
    cy.get('.side-bar__close').click({ force: true })
    cy.get(LAYER_SELECTOR).should('not.exist')

    replaceEditorText('SELECT i::DOUBLE AS latitude, i::DOUBLE AS longitude FROM range(100) t(i)')
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.assertDatasetTable('Query 1', ['latitude', 'longitude'])
    cy.assertDatasetRows('Query 1', 100)
    cy.contains('.layer__title__type', 'point').should('be.visible')
  })

  it('shows a DuckDB SQL error only on its query', () => {
    createReport()
    selectDuckDB()
    replaceEditorText("SELECT ST_Y('POINT (1 2)'::VARCHAR)")
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Query Error')
    cy.get('#dekart-query-status-message').parent().should('contain', 'ST_Y(VARCHAR)')
    cy.get('body').then($body => {
      expect($body.find('.ant-message-error')).to.have.length(0)
    })

    replaceEditorText('SELECT 1 AS value')
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
  })

  it('keeps an upstream DuckDB SQL error visible on a dependent query', () => {
    createReport()
    selectDuckDB()
    replaceEditorText("SELECT ST_Y('POINT (1 2)'::VARCHAR) AS latitude")
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Query Error')

    cy.get('button.ant-tabs-nav-add:visible').first().click()
    cy.contains('[role="tab"]', 'New').click({ force: true })
    selectDuckDB()
    replaceEditorText('SELECT * FROM datasets."Query 1"')
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Query Error')
    cy.get('#dekart-query-status-message').parent().should('contain', 'ST_Y(VARCHAR)')
    cy.get('body').then($body => {
      expect($body.find('.ant-message-error')).to.have.length(0)
    })
  })

  it('quotes dataset labels and skips failed sources in the default example', () => {
    createReport()
    selectDuckDB()
    replaceEditorText('SELECT unknown_function(1)')
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Query Error')

    cy.get('button.ant-tabs-nav-add:visible').first().click()
    cy.contains('[role="tab"]', 'New').click({ force: true })
    uploadActiveDataset('sample.csv')
    cy.get('.ant-message-notice', { timeout: 20000 }).should('not.exist')
    cy.get('.ant-tabs-tab-active .ant-tabs-tab-remove').click()
    cy.get('#dekart-dataset-name-input').type('source "one"')
    cy.get('#dekart-save-dataset-name-button').click()
    cy.get('#dekart-dataset-name-input', { timeout: 20000 }).should('not.exist')

    cy.get('button.ant-tabs-nav-add:visible').first().click()
    cy.contains('[role="tab"]', 'New').click({ force: true })
    selectDuckDB()
    cy.get('.ace_editor:not(.ace_autocomplete):visible textarea').type('datasets', { force: true }).type('.', { force: true })
    acceptAutocomplete('source "one"')
    editorShouldContain('datasets."source ""one"""')
    replaceEditorText('datasets."source ')
    cy.get('.ace_editor:not(.ace_autocomplete):visible textarea').type('o', { force: true })
    acceptAutocomplete('source "one"')
    editorShouldContain('datasets."source ""one"""')
    replaceEditorText('')
    insertSampleQuery('FROM datasets."source ""one"""')
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')

    replaceEditorText('')
    cy.get('.ant-message-notice', { timeout: 20000 }).should('not.exist')
    cy.get('.ant-tabs-tab-active .ant-tabs-tab-remove').click()
    cy.get('#dekart-dataset-name-input').type('source "one"')
    cy.get('#dekart-save-dataset-name-button').click()
    cy.get('#dekart-dataset-name-input', { timeout: 20000 }).should('not.exist')
    cy.get('.ace_editor:not(.ace_autocomplete):visible textarea').type('datasets', { force: true }).type('.', { force: true })
    cy.get('body').should($body => {
      expect($body.find('.ace_autocomplete:visible').text()).not.to.include('source "one"')
    })
    replaceEditorText('')
    insertSampleQuery('FROM range(100)')
    cy.get('#dekart-query-execute-button').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
  })
})
