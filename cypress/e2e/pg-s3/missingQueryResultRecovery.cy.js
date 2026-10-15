// Regression: A missing stored query-result CSV leaves the report at 404 without rerunning.
/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('pg-s3 missing query result recovery', () => {
  it('reruns a completed query and restores map data after its stored result disappears', () => {
    cy.intercept('GET', '**/dataset-source/*/*.csv', req => {
      req.on('before:response', res => { res.headers['cache-control'] = 'no-store' })
    }).as('initialSource')
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('button#dekart-create-report', { timeout: 30000 }).click({ force: true })
    cy.get('.ace_editor:not(.ace_autocomplete):visible textarea, button:contains("Run SQL directly on Postgres")', { timeout: 30000 }).then($elements => {
      if ($elements.filter('textarea').length === 0) {
        cy.wrap($elements.filter('button').first()).click({ force: true })
      }
    })
    cy.enterQuery('SELECT 42 AS value, 13.4 AS longitude, 52.5 AS latitude')
    cy.get(`button:contains("${copy.execute}"):visible`).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.openLayerPanel()
    cy.get('.layer__title__type', { timeout: 120000 }).should('be.visible')

    cy.wait('@initialSource', { timeout: 120000 }).then(({ request, response }) => {
      expect(response.statusCode).to.eq(200)
      const sourceURL = new URL(request.url)
      const [datasetId, sourceName] = sourceURL.pathname.split('/dataset-source/')[1].split('/')
      const sourceId = sourceName.replace(/\.csv$/, '')
      expect(datasetId).to.match(/^[0-9a-f-]{36}$/)
      expect(sourceId).to.match(/^[0-9a-f-]{36}$/)
      // Confirm that the generated result uses stored CSV retrieval, not DW or URI replay.
      cy.psql(`SELECT count(*) FROM datasets d JOIN query_jobs j ON j.query_id=d.query_id
        WHERE d.id='${datasetId}' AND j.job_result_id='${sourceId}' AND j.job_status=5
        AND coalesce(j.dw_job_id, '')='' AND coalesce(j.result_uri, '')=''`)
        .its('stdout').should('eq', '1')
      cy.exec(`bash ./cypress/support/deleteStoredResult.sh ${sourceId}`, { timeout: 30000 })

      cy.intercept('GET', sourceURL.pathname, req => {
        req.headers['cache-control'] = 'no-cache'
      }).as('missingSource')
      cy.intercept('GET', '**/dataset-source/*/*.csv', req => {
        if (!req.url.endsWith(`/${sourceId}.csv`)) req.alias = 'recoveredSource'
      })
      cy.intercept('POST', '**/Dekart/RunQuery').as('recoveryQuery')
      cy.reload()
      cy.wait('@missingSource', { timeout: 120000 }).its('response.statusCode').should('eq', 410)
      cy.wait('@recoveryQuery', { timeout: 120000 }).its('response.statusCode').should('eq', 200)
      cy.wait('@recoveredSource', { timeout: 120000 }).its('response.statusCode').should('eq', 200)
    })

    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.get('div:contains("1 row")', { timeout: 120000 }).should('be.visible')
    cy.openLayerPanel()
    cy.get('.layer__title__type', { timeout: 120000 }).should('be.visible')
    cy.waitForMapSettingsEnabled()
    cy.get('.source-data-title .dataset-name').first().then($name => {
      const section = $name.closest('.source-data-title').parent().parent()
      section.find('.show-data-table svg')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    cy.get('#dataset-modal .header-cell[title="value"]', { timeout: 30000 }).should('be.visible')
    cy.get('#dataset-modal .cell.row-0[title="42"]').should('be.visible')
    cy.get('.mapboxgl-canvas').should('be.visible')
  })
})
