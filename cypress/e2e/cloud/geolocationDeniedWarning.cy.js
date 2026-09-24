/* eslint-disable no-undef */

describe('geolocation denied warning', () => {
  beforeEach(() => {
    cy.resetCloudTestDatabase()
    cy.setDevClaimsEmail('geolocation-denied@example.com')
    cy.visit('/')
    cy.ensureTestWorkspace()
  })

  it('shows a warning, not an error, when location access is denied', () => {
    cy.window().then((win) => {
      cy.stub(win.navigator.geolocation, 'watchPosition').callsFake((onSuccess, onError) => {
        onError({ code: 1, message: 'User denied Geolocation' })
        return 1
      })
    })
    cy.get('button#dekart-create-report').click()
    cy.location('pathname', { timeout: 30000 }).should('match', /^\/reports\/[0-9a-f-]+(\/source)?$/)

    cy.get('#dekart-show-my-location', { timeout: 60000 }).click()

    cy.contains('.ant-message-warning', 'User denied Geolocation').should('be.visible')
    cy.get('.ant-message-error').should('not.exist')
  })
})
