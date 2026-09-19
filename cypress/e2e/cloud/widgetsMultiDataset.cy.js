/* global cy, describe, it, Cypress */

function uploadCsv (name, rows, addDataset = false) {
  if (addDataset) cy.get('.ant-tabs-nav-add:visible').last().click()
  cy.contains('button', 'Upload File', { timeout: 30000 }).click()
  cy.get('input[type="file"]').selectFile({
    contents: Cypress.Buffer.from(`latitude,longitude,category,amount\n${rows.join('\n')}\n`),
    fileName: name,
    mimeType: 'text/csv'
  }, { force: true })
  cy.contains('button', /^Upload$/).click()
  cy.contains('Ready', { timeout: 120000 }).should('be.visible')
}

function openWidgets () {
  cy.get('[data-testid="widgets-tab"]', { timeout: 30000 }).then(button => {
    if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
  })
}

describe('Widgets dataset lifecycle', () => {
  it('creates defaults for each UI dataset, isolates filters, and keeps viewer edits local', () => {
    cy.viewport(1280, 960)
    const email = `widgets-datasets-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => { request.headers['X-Dekart-Claim-Email'] = email })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()

    uploadCsv('dataset-a.csv', ['52.1,13.1,North,10', '52.2,13.2,North,20', '52.3,13.3,South,30', '52.4,13.4,South,40'])
    cy.get('[data-testid="number-value"]', { timeout: 180000 }).should('have.text', '4')
    uploadCsv('dataset-b.csv', ['53.1,14.1,Open,5', '53.2,14.2,Closed,15', '53.3,14.3,Closed,25'], true)
    openWidgets()

    cy.get('[data-testid="dataset-widgets"]', { timeout: 180000 }).should('have.length', 2)
    cy.get('[data-testid="number-value"]').should('have.length', 2).should(values => {
      const text = [...values].map(value => value.textContent)
      if (!text.includes('4') || !text.includes('3')) throw new Error(`Expected independent totals 4 and 3, got ${text.join(', ')}`)
    })
    cy.get('[data-testid="dataset-widgets"]').eq(1).within(() => {
      cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line', { timeout: 30000 }).first().click()
      cy.get('[data-testid="number-value"]').should('have.text', '1')
    })
    cy.get('[data-testid="dataset-widgets"]').eq(0).find('[data-testid="number-value"]').should('have.text', '4')
    cy.contains('button', 'Clear all').click()
    cy.get('[data-testid="dataset-widgets"]').eq(1).find('[data-testid="number-value"]', { timeout: 30000 }).should('have.text', '3')

    // Leave immediately: the mode transition must flush the pending authored
    // defaults instead of relying on the one-second autosave debounce.
    cy.contains('.ant-select', 'Editing').click()
    cy.contains('.ant-select-item-option-content', 'Viewing').click()
    cy.location('pathname').should('not.match', /\/source$/)
    cy.get('[data-testid="number-value"]', { timeout: 180000 }).should('have.length', 2)
    cy.get('[data-testid="dataset-widgets"]').eq(0).within(() => {
      cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line', { timeout: 30000 }).first().click()
      cy.get('[data-testid="number-value"]').should('have.text', '2')
    })
    cy.contains('button', 'Add chart').click()
    cy.contains('button', /^Number/).click()
    cy.contains('button', /^Create$/).click()
    cy.get('[data-testid="number-value"]').should('have.length', 3)
    cy.contains('.ant-select', 'Viewing').click()
    cy.contains('.ant-select-item-option-content', 'Editing').click()
    cy.location('pathname').should('match', /\/source$/)
    cy.get('[data-testid="number-value"]', { timeout: 180000 }).should('have.length', 2)
    cy.get('[data-testid="dataset-widgets"]').eq(0).find('[data-testid="number-value"]').should('have.text', '4')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'No filters')
    cy.reload()
    openWidgets()
    cy.get('[data-testid="number-value"]', { timeout: 180000 }).should('have.length', 2)
    cy.get('[data-testid="dataset-widgets"]').eq(1).within(() => {
      cy.get('[data-testid="category-chart"] g[aria-label="rule"][data-index="4"] line', { timeout: 30000 }).first().click()
      cy.get('[data-testid="number-value"]').should('have.text', '1')
    })
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'category')

    cy.get('button[aria-label="Chart actions"]').first().click()
    cy.contains('[role="menuitem"]', 'Edit chart').click()
    cy.get('#widget-title').clear().type('Pending row count')
    cy.contains('button', 'Back to charts').click()

    cy.get('.ant-tabs-tab-remove:visible').last().click()
    cy.contains('button', 'Delete Dataset').click()
    cy.contains('.ant-modal-confirm', 'Remove dataset from map?').within(() => cy.contains('button', 'Yes').click())
    cy.contains('Dataset removed', { timeout: 30000 }).should('be.visible')
    cy.get('[data-testid="dataset-widgets"]', { timeout: 30000 }).should('have.length', 1)
    cy.get('[data-testid="number-value"]').should('have.length', 1)
    cy.get('[data-testid="missing-widget-source"]').should('not.exist')
    cy.contains('The dataset for these charts is no longer available.').should('not.exist')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'No filters')
    cy.contains('This report changed in another session').should('not.exist')
    cy.contains('Map changed').should('not.exist')
    cy.contains('Pending row count').should('be.visible')
    cy.get('button#dekart-save-button').should('not.be.disabled').click()
    cy.get('button#dekart-save-button', { timeout: 30000 }).should('not.be.disabled')
    cy.reload()
    openWidgets()
    cy.get('[data-testid="dataset-widgets"]', { timeout: 180000 }).should('have.length', 1)
    cy.get('[data-testid="number-value"]').should('have.length', 1).and('have.text', '4')
    cy.contains('Pending row count').should('be.visible')
    cy.get('[data-testid="missing-widget-source"]').should('not.exist')
    cy.contains('The dataset for these charts is no longer available.').should('not.exist')
  })
})
