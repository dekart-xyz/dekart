// Regression: Cross-filtering a dataset without charts prevents another selection (2166e1d).
/* global cy, describe, it, Cypress */

// Match a dashboard whose cross-filter target has map data but no charts.
function uploadDataset (name, addDataset = false) {
  if (addDataset) cy.get('.ant-tabs-nav-add:visible').last().click()
  cy.contains('button', 'Upload File', { timeout: 30000 }).click()
  cy.get('input[type="file"]').selectFile({
    contents: Cypress.Buffer.from('latitude,longitude,power_tier,charge_points\n52.1,13.1,HPC,10\n52.2,13.2,HPC,20\n52.3,13.3,AC,30\n'),
    fileName: name,
    mimeType: 'text/csv'
  }, { force: true })
  cy.contains('button', /^Upload$/).click()
  cy.contains('Ready', { timeout: 120000 }).should('be.visible')
}

describe('Widget cross-filter target without charts', () => {
  it('allows another selection after filtering a dataset with no charts', () => {
    cy.viewport(1280, 960)
    const email = `widgets-no-target-charts-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    uploadDataset('stations.csv')
    cy.get('[data-testid="number-value"]', { timeout: 180000 }).should('have.text', '3')
    uploadDataset('catchments.csv', true)
    cy.get('[data-testid="number-value"]', { timeout: 180000 }).should('have.length', 2)
    cy.get('[data-testid="widgets-tab"]').then(button => {
      if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
    })
    // Removing target charts retains the dataset and its matching filter fields.
    cy.get('[data-widget-source="catchments.csv"]').then(widgets => {
      for (let index = 0; index < widgets.length; index++) {
        cy.get('[data-widget-source="catchments.csv"]').first().find('button[aria-label="Chart actions"]').click()
        cy.contains('[role="menuitem"]', 'Delete chart').click()
      }
    })
    cy.get('[data-widget-source="catchments.csv"]').should('not.exist')
    cy.get('[data-testid="category-chart"]').closest('[data-testid="widget-item"]').find('button[aria-label="Chart actions"]').click()
    cy.contains('[role="menuitem"]', 'Edit chart').click()
    cy.contains('[data-testid="cross-filter-setting"] label', 'Cross-filter').click()
    cy.get('[data-testid="cross-filter-setting"]').should('contain.text', 'Matches:')
    cy.contains('button', 'Back to charts').click()
    cy.get('#dekart-save-button').click()
    cy.get('button#dekart-save-button .anticon-cloud', { timeout: 60000 }).should('exist')
    cy.reload()
    cy.get('[data-testid="number-value"]', { timeout: 120000 }).should('have.text', '3')
    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line', { timeout: 30000 }).first().click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '2')
    cy.get('[data-testid="filter-strip"]').should('contain.text', '2 datasets')
    cy.get('[aria-label="Report charts"]').should('have.attr', 'aria-busy', 'false')
    cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line').last().click()
    cy.get('[data-testid="number-value"]').should('have.text', '1')
    cy.contains('button', 'Clear all').click()
    cy.get('[data-testid="number-value"]').should('have.text', '3')
  })
})
