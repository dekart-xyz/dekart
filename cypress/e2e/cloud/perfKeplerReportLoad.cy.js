/* global cy, describe, it, after, Cypress */

const files = [
  'residential.csv',
  'camp.csv',
  'state.csv',
  'county.csv',
  'suburb.csv',
  'flood-zones.csv'
]
const layerSelector = '[data-testid="sortable-layer-item"], [data-testid="static-layer-item"]'
const reportLoadTimeout = 600000
const performanceDescribe = Cypress.env('runPerformance') ? describe : describe.skip

performanceDescribe('full-size six GeoJSON CSV report load', () => {
  let fixtureDirectory
  let expectedRows

  after(() => {
    if (fixtureDirectory) {
      cy.exec(`node cypress/support/generateKeplerReportFiles.js --cleanup ${fixtureDirectory}`)
    }
  })

  // The full-size fixture remains available with --env runPerformance=true.
  it('loads all datasets again when the report is reopened', () => {
    const email = `kepler-report-load-${Date.now()}@example.com`
    cy.exec('node cypress/support/generateKeplerReportFiles.js', { timeout: 120000 })
      .then(({ stdout }) => { fixtureDirectory = stdout })
    cy.then(() => cy.readFile(`${fixtureDirectory}/manifest.json`)).then(rows => { expectedRows = rows })
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()

    files.forEach((name, index) => {
      if (index > 0) cy.get('.ant-tabs-nav-add:visible').last().click()
      cy.contains('button', 'Upload File', { timeout: 30000 }).click()
      cy.then(() => cy.get('input[type="file"]', { timeout: 120000 }).selectFile(`${fixtureDirectory}/${name}`, { force: true }))
      cy.contains('button', /^Upload$/).click()
      cy.contains('Ready', { timeout: index === files.length - 1 ? reportLoadTimeout : 120000 }).should('be.visible')
      cy.openLayerPanel()
      if (index === files.length - 1) {
        // The full-size final CSV can take several minutes to download locally.
        cy.contains('.source-data-title .dataset-name', name, { timeout: reportLoadTimeout }).should('be.visible')
        cy.contains('Downloading Map Data', { timeout: reportLoadTimeout }).should('not.exist')
        cy.get(layerSelector).then(layers => {
          if (layers.length === index) {
            cy.contains('button', 'Add Layer').click()
            cy.contains(name).last().click()
          }
        })
        cy.get(layerSelector, { timeout: reportLoadTimeout }).should('have.length', files.length)
      } else {
        cy.get(layerSelector, { timeout: 120000 }).should('have.length', index + 1)
      }
      cy.contains('Kepler failed to publish the dataset.').should('not.exist')
    })

    cy.get('button#dekart-save-button').click()
    cy.get('button#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
    cy.location('pathname').should('match', /^\/reports\/[a-f0-9-]+\/source$/)
      .then(pathname => cy.visit(pathname))
    cy.openLayerPanel()
    cy.get('.source-data-title', { timeout: reportLoadTimeout }).should('have.length', files.length)
    cy.get(layerSelector, { timeout: reportLoadTimeout }).should('have.length', files.length)
    cy.then(() => {
      files.forEach(name => cy.assertDatasetRows(name, expectedRows[name], reportLoadTimeout))
    })
    cy.contains('Kepler failed to publish the dataset.').should('not.exist')
  })
})
