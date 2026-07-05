/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

function sqlString (value) {
  return `'${value.replace(/'/g, "''")}'`
}

function setInputValue (selector, value) {
  cy.get(selector).then(($input) => {
    const el = $input[0]
    const valueSetter = Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView.HTMLInputElement.prototype, 'value').set
    valueSetter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new Event('blur', { bubbles: true }))
  })
}

function openPostgresConnectionModal () {
  cy.visit('http://localhost:3000/connections')
  cy.get('body', { timeout: 30000 }).should(($body) => {
    const ready = $body.find('#dekart-connection-type-card-postgres').length > 0 ||
      $body.find('#dekart-new-connection-connections').length > 0 ||
      $body.find('#dekart-new-connection-onboarding').length > 0 ||
      $body.find('#dekart-create-report').length > 0
    expect(ready, 'connection entry point should be visible').to.eq(true)
  }).then(($body) => {
    const onSelectorScreen = $body.find('#dekart-connection-type-card-postgres').length > 0
    if (onSelectorScreen) {
      cy.get('#dekart-connection-type-card-postgres', { timeout: 20000 }).click({ force: true })
      return
    }
    const onConnectionsPage = $body.find('#dekart-new-connection-connections').length > 0
    if (onConnectionsPage) {
      cy.get('#dekart-new-connection-connections', { timeout: 20000 }).click({ force: true })
    } else if ($body.find('#dekart-create-report').length > 0) {
      cy.get('#dekart-create-report', { timeout: 20000 }).click({ force: true })
      cy.contains('Add and edit connections', { timeout: 20000 }).click({ force: true })
      cy.get('#dekart-new-connection-connections', { timeout: 20000 }).click({ force: true })
    } else {
      cy.get('#dekart-new-connection-onboarding', { timeout: 20000 }).click({ force: true })
    }
    cy.get('#dekart-connection-type-card-postgres', { timeout: 20000 }).click({ force: true })
  })
}

describe('cloud postgres TLS connector happy path', () => {
  before(() => {
    cy.resetCloudTestDatabase()
  })

  it('creates a cloud Postgres TLS connection, tests it, saves it, and runs a map query', () => {
    const connName = `Postgres Cloud TLS ${Date.now()}`
    const email = `cloud-postgres-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept('POST', '**/Dekart/TestConnection').as('testConnection')
    cy.intercept('POST', '**/Dekart/CreateConnection').as('createConnection')
    cy.intercept('POST', '**/Dekart/RunQuery').as('runQuery')

    cy.visit('http://localhost:3000/')
    cy.ensureTestWorkspace()
    cy.get('button#dekart-create-report', { timeout: 60000 }).should('be.visible')
    // Upgrade only this test workspace so Cloud plan limits do not obscure the Postgres TLS flow.
    cy.psql(`
      INSERT INTO subscription_log (authored_by, plan_type, workspace_id)
      SELECT 'cypress', 7, workspace_id
      FROM workspace_log
      WHERE email = ${sqlString(email)}
      ORDER BY created_at DESC
      LIMIT 1
    `)
    openPostgresConnectionModal()

    cy.get('div.ant-modal-title', { timeout: 20000 }).should('contain', 'Postgres')
    cy.contains('a', 'Read setup instructions').should('have.attr', 'href').and('include', '/docs/usage/postgres-connection/')
    cy.contains('.ant-select-selection-item', 'Require SSL').should('exist')
    setInputValue('input#connectionName', connName)
    setInputValue('input#postgresHost', 'localhost')
    setInputValue('input#postgresUsername', 'postgres')
    setInputValue('input#postgresPassword', 'dekart')
    setInputValue('input#postgresDatabase', 'dekart_geo')
    setInputValue('input#postgresPort', '5433')

    cy.get('button#testConnection').click()
    cy.wait('@testConnection', { timeout: 30000 }).its('response.body').should('exist')
    cy.get('button#saveConnection', { timeout: 60000 }).should('be.enabled').click()
    cy.wait('@createConnection')

    cy.visit('http://localhost:3000/')
    cy.get('button#dekart-create-report', { timeout: 30000 }).click()
    cy.location('pathname', { timeout: 60000 }).should('match', /^\/reports\/[0-9a-f-]+\/source$/)
    cy.contains('button', connName, { timeout: 60000 }).click({ force: true })
    cy.get('textarea', { timeout: 20000 }).type('SELECT * FROM sample.geospatial_points LIMIT 100', { force: true })
    cy.get('button#dekart-query-execute-button').click()
    cy.wait('@runQuery', { timeout: 120000 })
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.get('div:contains("100 rows")', { timeout: 120000 }).should('be.visible')
    cy.get('button#dekart-share-report').click()
    cy.get('span:contains("No Access")').click()
    cy.get('div.dekart-share-view').click({ force: true })
    cy.get('button').contains('Done').click()
  })
})
