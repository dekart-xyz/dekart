/* eslint-disable no-undef */

const testEmail = `geosql-banner-${Date.now()}@example.com`

// Open a fresh Postgres query editor with a tracking spy.
function openQueryEditor () {
  cy.setDevClaimsEmail(testEmail)
  cy.visit('/', {
    onBeforeLoad (win) {
      win.plausible = Cypress.sinon.stub()
    }
  })
  cy.get('button#dekart-create-report').click()
  cy.get('button:contains("Run SQL")').click()
}

describe('GeoSQL query editor banner', () => {
  beforeEach(() => {
    cy.psql("DELETE FROM device_auth_log WHERE device_id = 'geosql-banner-test-device'")
  })

  after(() => {
    cy.psql("DELETE FROM device_auth_log WHERE device_id = 'geosql-banner-test-device'")
  })

  it('stays visible while typing and after CTA engagement', () => {
    openQueryEditor()
    cy.get('#dekart-geosql-banner').should('be.visible')
    cy.window().its('plausible').should('have.been.calledWith', 'AgentHintShown')

    cy.get('textarea').type('SELECT 1', { force: true })
    cy.get('#dekart-geosql-banner').should('be.visible')
    cy.get('#dekart-geosql-banner-link')
      .should('have.attr', 'href', 'https://github.com/dekart-xyz/geosql#geosql')
      .and('have.attr', 'target', '_blank')
      .then(($link) => {
        $link[0].addEventListener('click', event => event.preventDefault())
      })
      .click()
    cy.window().its('plausible').should('have.been.calledWith', 'AgentHintClicked')

    cy.location('pathname').then((reportPath) => {
      cy.visit(reportPath)
      cy.get('#dekart-geosql-banner').should('be.visible')
    })
  })

  it('tracks dismissal and remembers it across reloads', () => {
    openQueryEditor()
    cy.get('#dekart-geosql-banner').should('be.visible')
    cy.get('#dekart-geosql-banner-dismiss').click()
    cy.get('#dekart-geosql-banner').should('not.exist')
    cy.window().its('plausible').should('have.been.calledWith', 'AgentHintDismissed')

    cy.location('pathname').then((reportPath) => {
      cy.visit(reportPath, {
        onBeforeLoad (win) {
          win.plausible = Cypress.sinon.stub()
        }
      })
      cy.get('#dekart-geosql-banner').should('not.exist')
    })
  })

  it('hides for a user with a device authorization', () => {
    cy.psql(`
      INSERT INTO device_auth_log (
        id, device_id, device_name, status, email, workspace_id, expires_at, created_at
      ) VALUES (
        gen_random_uuid(),
        'geosql-banner-test-device',
        'GeoSQL banner test',
        'authorized',
        '${testEmail}',
        '00000000-0000-0000-0000-000000000000',
        CURRENT_TIMESTAMP + INTERVAL '1 day',
        CURRENT_TIMESTAMP
      )
    `)

    openQueryEditor()
    cy.get('#dekart-geosql-banner').should('not.exist')
  })
})
