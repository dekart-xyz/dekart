/* eslint-disable no-undef */
import { LAYER_SELECTOR, createReport } from '../local/duckdbHelpers'

// Match the reported BigQuery query while bounding reproduction cost.
export const ROW_LIMIT = 1000
export const SQL = `SELECT lat, lng, station_code,
ROUND(planned_service_s / 60, 1) AS service_min
FROM \`dekart-data-samples.demo_data_samples.last_mile_dropoffs\`
WHERE ROUND(planned_service_s / 60, 1) < 10
AND packages < 5
AND station_code LIKE {{station}}
LIMIT ${ROW_LIMIT}`

// Wait for the visible saved state before opening the viewer.
export function saveReport () {
  cy.get('#dekart-save-button').should('be.enabled').click()
  cy.get('#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
}

// Create the saved customer query with one authored point layer.
export function createParameterizedReport () {
  cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN')
  cy.visit('/')
  cy.ensureTestWorkspace()
  createReport()
  cy.location('pathname').should('match', /^\/reports\/[a-f0-9-]+\/source$/).as('newReportPath')
  cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN', '/connections')
  cy.visit('/')
  cy.contains('.ant-radio-button-wrapper', 'Connections', { timeout: 30000 }).click()
  cy.location('pathname').should('eq', '/connections')
  cy.get([
    '#dekart-connection-type-card-bigquery',
    '#dekart-new-connection-connections',
    '#dekart-new-connection-onboarding'
  ].join(', '), { timeout: 30000 }).should('be.visible')
  cy.get('body').then($body => {
    // Existing workspaces open their connection list instead of the first-run chooser.
    if (!$body.find('#dekart-connection-type-card-bigquery').length) {
      cy.get('#dekart-new-connection-connections, #dekart-new-connection-onboarding').first().click()
    }
  })
  cy.get('#dekart-connection-type-card-bigquery').click()
  cy.location('pathname').then(path => cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN', path))
  cy.contains('button', 'Connect with Google').click()
  cy.contains('.ant-modal-title:visible', 'BigQuery', { timeout: 30000 }).should('be.visible')
  const connectionName = `Parameter BigQuery reproduction ${Date.now()}`
  cy.get('input#connectionName:visible').clear().type(connectionName)
  cy.get('input#bigqueryProjectId:visible').clear().type('dekart-dev')
  cy.get('input#cloudStorageBucket:visible').clear().type('dekart-dev')
  cy.get('#testConnection:visible').click()
  cy.get('#saveConnection:visible', { timeout: 60000 }).should('be.enabled').click()
  cy.get('@newReportPath').then(path => {
    cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN', path)
    cy.visit(path)
  })
  cy.contains('button', connectionName, { timeout: 30000 }).scrollIntoView().click({ force: true })
  cy.enterQuery(SQL)
  cy.contains('.ant-input-group-addon', 'station', { timeout: 30000 }).should('be.visible')
  saveReport()
  cy.contains('.ant-input-group-addon', 'station').parent().find('input').first().clear().type('DLA5%')
  cy.get('button[title="Apply query parameters"]').should('be.enabled').click()
  cy.assertDatasetRows('Query 1', ROW_LIMIT)
  cy.get(LAYER_SELECTOR).should('have.length', 1)

  cy.intercept('POST', '**/Dekart/UpdateReport').as('initialMapSave')
  saveReport()
  // Let any save already queued by dataset binding settle before reusing its report version.
  cy.wait(1500)
  cy.get('@initialMapSave.all').then(saves => cy.wrap(saves[saves.length - 1]).as('savedMapRequest'))
}
