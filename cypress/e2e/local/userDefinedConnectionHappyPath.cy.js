/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('postgres user-defined connection happy path', () => {
  it('creates postgres connection, saves it, and runs query via that connection', () => {
    const connName = `Postgres Local ${Date.now()}`
    cy.setDevClaimsEmail(`postgres-local-${Date.now()}@example.com`)
    const setInputValue = (selector, value) => {
      cy.get(selector).then(($input) => {
        const el = $input[0]
        const valueSetter = Object.getOwnPropertyDescriptor(el.ownerDocument.defaultView.HTMLInputElement.prototype, 'value').set
        valueSetter.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        el.dispatchEvent(new Event('blur', { bubbles: true }))
      })
    }

    cy.intercept('POST', '**/Dekart/TestConnection').as('testConnection')
    cy.intercept('POST', '**/Dekart/CreateConnection').as('createConnection')
    cy.intercept('POST', '**/Dekart/RunQuery').as('runQuery')

    cy.visit('/connections')

    cy.get('body', { timeout: 20000 }).should(($body) => {
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

    cy.get('div.ant-modal-title', { timeout: 20000 }).should('contain', 'Postgres')
    cy.contains('.ant-select-selection-item', 'Disable SSL').should('exist')
    setInputValue('input#connectionName', connName)
    setInputValue('input#postgresHost', 'localhost')
    setInputValue('input#postgresUsername', 'postgres')
    setInputValue('input#postgresPassword', 'dekart')
    setInputValue('input#postgresDatabase', 'dekart_geo')
    setInputValue('input#postgresPort', String(Cypress.env('DEKART_POSTGRES_PORT')))

    cy.get('button#testConnection').click()
    cy.wait('@testConnection')
    cy.get('button#saveConnection', { timeout: 60000 }).should('be.enabled').click()
    cy.wait('@createConnection')

    cy.visit('/')
    cy.get('button#dekart-create-report', { timeout: 20000 }).click()
    cy.contains('button', connName, { timeout: 60000 }).click({ force: true })
    cy.enterQuery(`SELECT ST_MakeEnvelope(
      -118.08330882698346, 33.7756905,
      -118.06330882698346, 33.7956905,
      4326
    ) AS geometry`)
    cy.get('button#dekart-query-execute-button').click()
    cy.wait('@runQuery', { timeout: 120000 })
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
    cy.get('div:contains("1 rows")', { timeout: 120000 }).should('be.visible')
    cy.contains('.layer__title__type', 'geojson', { timeout: 120000 }).should('be.visible')
    cy.get('.source-data-title .dataset-name').first().then($name => {
      const section = $name.closest('.source-data-title').parent().parent()
      section.find('.show-data-table svg')[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    cy.get('#dataset-modal .header-cell[title="geometry"]', { timeout: 30000 }).should('be.visible')
    cy.get('#dataset-modal .cell.row-0').first()
      .should('have.attr', 'title')
      .and('match', /^0103000000/)
    cy.get('.modal--close').click()
    cy.get('.mapboxgl-canvas').should('be.visible')
  })
})
