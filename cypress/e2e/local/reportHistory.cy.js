/* eslint-disable no-undef */

import { createReport, editorShouldContain, replaceEditorText, runActiveDuckDBQuery } from './duckdbHelpers'
import { openHistory } from '../bq/duckdbRefreshHelpers'

describe('Local report history', () => {
  it('restores a saved query and keeps its dataset available', () => {
    const before = "SELECT 'before' AS snapshot_marker"
    const after = "SELECT 'after' AS snapshot_marker"
    createReport()
    runActiveDuckDBQuery(before)
    cy.assertDatasetTable('Query 1', ['snapshot_marker'], ['before'])

    replaceEditorText(after)
    editorShouldContain(after)
    openHistory()
    cy.get('.ant-modal:visible .ant-tag').filter(':contains("Map Edit")').eq(1)
      .closest('[class*="changeItem"]').contains('button', 'Restore').click()
    cy.contains('Snapshot restored', { timeout: 30000 }).should('be.visible')

    cy.contains('[role="tab"]', 'Query 1', { timeout: 30000 }).click({ force: true })
    editorShouldContain(before)
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.assertDatasetTable('Query 1', ['snapshot_marker'], ['before'])
  })
})
