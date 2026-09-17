/* global cy, describe, it, Cypress */

describe('Widget category layout', () => {
  it('renders a high-cardinality category chart', () => {
    cy.viewport(1280, 960)
    const email = `widgets-category-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => {
      request.headers['X-Dekart-Claim-Email'] = email
    })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()
    cy.get('[data-testid="widgets-tab"]').click()
    cy.contains('button', 'Upload File', { timeout: 30000 }).click()
    const categories = ['THEFT', 'BATTERY', 'CRIMINAL DAMAGE', 'NARCOTICS', 'ASSAULT', 'OTHER OFFENSE', 'BURGLARY', 'MOTOR VEHICLE THEFT', 'DECEPTIVE PRACTICE', 'ROBBERY', 'CRIMINAL TRESPASS', 'WEAPONS VIOLATION', 'OFFENSE INVOLVING CHILDREN', 'PROSTITUTION', 'PUBLIC PEACE VIOLATION', 'SEX OFFENSE', 'INTERFERENCE WITH PUBLIC OFFICER', 'LIQUOR LAW VIOLATION', 'CRIM SEXUAL ASSAULT', 'CRIMINAL SEXUAL ASSAULT']
    const rows = categories.flatMap((category, index) => Array.from({ length: 20 - index }, () => `52,13,${category},${index * 3}`))
    cy.get('input[type="file"]').selectFile({
      contents: Cypress.Buffer.from(`latitude,longitude,primary_type,district\n${rows.join('\n')}\n`),
      fileName: 'widgets-category-layout.csv',
      mimeType: 'text/csv'
    }, { force: true })
    cy.contains('button', /^Upload$/).click()
    cy.contains('Ready', { timeout: 120000 }).should('be.visible')
    cy.get('[data-testid="widgets-tab"]', { timeout: 180000 }).should('have.attr', 'aria-expanded', 'true')
    cy.get('[data-testid="category-count"]', { timeout: 180000 }).should('have.text', '20 values')
    cy.get('[data-testid="category-chart"]', { timeout: 180000 }).should('contain.text', 'THEFT').and('contain.text', 'CRIMINAL DAMAGE')
    cy.get('[data-testid="category-chart"] g[aria-label="bar"] rect').should('have.length', 20)
  })
})
