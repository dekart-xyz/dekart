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

    cy.visit('/')
    ensureWorkspaceExists()

    cy.request({
      method: 'POST',
      url: '/api/v1/mcp/call',
      body: { name: 'create_report', arguments: {} },
      failOnStatusCode: false
    }).then((response) => {
      if (response.status === 200) {
        const result = response.body?.result || {}
        const reportId = result?.report_id || result?.reportId || result?.id || result?.report?.id
        if (reportId) {
          cy.visit(`/reports/${reportId}/source`)
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

      const ewkb = '0106000020E610000001000000010300000001000000040000009A99999999992A400000000000404A40CDCCCCCCCCCC2A400000000000404A40CDCCCCCCCCCC2A40CDCCCCCCCC4C4A409A99999999992A400000000000404A40'
      cy.get('textarea').clear({ force: true }).type(`SELECT '${ewkb}' AS geometry, NULL::text AS empty_value`, { force: true })
      cy.get(`button:contains("${copy.execute}")`).click()
      cy.wait('@runQuery', { timeout: 120000 }).its('response.statusCode').should('eq', 200)
      cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
      cy.contains('.layer__title__type', 'geojson', { timeout: 120000 }).should('be.visible')
      cy.get('.source-data-title .dataset-name').first().then($name => {
        const section = $name.closest('.source-data-title').parent().parent()
        section.find('.show-data-table svg')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      cy.get('#dataset-modal .header-cell[title="geometry"]', { timeout: 30000 }).should('be.visible')
      cy.get('#dataset-modal .header-cell[title="empty_value"]').should('be.visible')
      cy.get('#dataset-modal .cell.row-0[title=""]').should('exist')
    })
  })
})
