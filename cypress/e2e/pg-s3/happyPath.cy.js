/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('pg-s3 happy path', () => {
  it('runs postgres query with s3-backed result storage', () => {
    cy.intercept('POST', '**/Dekart/RunQuery').as('runQuery')

    const ensureWorkspaceExists = () => {
      cy.get('body', { timeout: 30000 }).then(($body) => {
        if (!$body.text().includes('Start Mapping in Seconds')) return
        cy.get('button#dekart-create-workspace', { timeout: 30000 }).click({ force: true })
        cy.get('input#name', { timeout: 30000 }).clear().type(`pg-s3-${Date.now()}`, { force: true })
        cy.get('#source').click({ force: true })
        cy.get('.ant-select-item-option').contains('Google Search').click({ force: true })
        cy.contains('button', 'Create').click({ force: true })
        cy.get('button#dekart-create-report', { timeout: 60000 }).should('be.visible')
      })
    }

    cy.visit('http://localhost:3000/')
    ensureWorkspaceExists()

    cy.request({
      method: 'POST',
      url: 'http://localhost:3000/api/v1/mcp/call',
      body: { name: 'create_report', arguments: {} },
      failOnStatusCode: false
    }).then((response) => {
      if (response.status === 200) {
        const result = response.body?.result || {}
        const reportId = result?.report_id || result?.reportId || result?.id || result?.report?.id
        if (reportId) {
          cy.visit(`http://localhost:3000/reports/${reportId}/source`)
          return
        }
      }
      cy.get('body', { timeout: 30000 }).then(($body) => {
        if ($body.find('button#dekart-create-report').length > 0) {
          cy.get('button#dekart-create-report').click({ force: true })
          return
        }
        if ($body.find('button:contains("New Map")').length > 0) {
          cy.contains('button', 'New Map').click({ force: true })
        }
      })
    })

    cy.get('body', { timeout: 30000 }).then(($body) => {
      if (!$body.text().match(/Run SQL directly on Postgres|Run SQL directly on PostgreSQL|Postgres/i)) return
      cy.contains('button', /Run SQL directly on Postgres|Run SQL directly on PostgreSQL|Postgres/i, { timeout: 30000 }).first().click({ force: true })
      cy.get('textarea', { timeout: 30000 }).type(copy.simple_pg_query, { force: true })
      cy.get(`button:contains("${copy.execute}")`).click()
      cy.wait('@runQuery', { timeout: 120000 }).its('response.statusCode').should('eq', 200)
      cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
      cy.get('div:contains("1 rows")', { timeout: 120000 }).should('be.visible')
      cy.get(`span:contains("${copy.downloading}")`, { timeout: 120000 }).should('contain', 'B')
    })
  })
})
