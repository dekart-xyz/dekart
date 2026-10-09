/* eslint-disable no-undef */
import { createReport, editorShouldContain } from '../local/duckdbHelpers'

const email = `dataset-layout-${Date.now()}@dekart.xyz`

describe('dataset selector without connections', () => {
  it('shows one connection button below the query cards', () => {
    cy.setDevClaimsEmail(`dataset-no-connections-${Date.now()}@dekart.xyz`)
    cy.visit('/')
    cy.ensureTestWorkspace()
    createReport()
    cy.get('section[aria-label="Query"]').within(() => {
      cy.contains('button', 'DuckDB').should('be.visible')
      cy.get('button').should('have.length', 1)
    })
    cy.get('#dekart-add-connection').should('have.length', 1)
      .and('be.visible').and('contain', 'Add and edit connections')
      .and('have.css', 'border-top-style', 'dashed').then($button => {
        cy.get('section[aria-label="Query"]').then($query => {
          expect($button[0].getBoundingClientRect().top)
            .to.be.greaterThan($query[0].getBoundingClientRect().bottom)
        })
      })
    cy.get('#dekart-add-connection').click()
    cy.location('pathname').should('eq', '/connections')
    cy.get('#dekart-connection-type-card-http', { timeout: 30000 }).click()
    cy.get('#connectionName').clear().type('First connection')
    cy.get('#httpBaseUrl').type('https://example.com/data')
    cy.get('#saveConnection').click()
    cy.contains('button', 'First connection', { timeout: 30000 }).should('be.visible')
    cy.get('section[aria-label="Query"] button').should('have.length', 2)
    cy.get('#dekart-add-connection').should('have.length', 1).and('be.visible')
  })
})

describe('new dataset panel layout', () => {
  before(() => {
    cy.setDevClaimsEmail(email)
    cy.visit('/')
    cy.ensureTestWorkspace()
    createReport()
    cy.visit('/connections')
    cy.get('#dekart-connection-type-card-http', { timeout: 30000 }).click()
    cy.get('#connectionName').clear().type('TravelTime')
    cy.get('#httpBaseUrl').type('https://api.traveltimeapp.com/v4')
    cy.get('#saveConnection').click()
    cy.get('.ant-modal:visible').should('not.exist')
  })

  beforeEach(() => {
    cy.setDevClaimsEmail(email)
    createReport()
    cy.contains('button', 'TravelTime', { timeout: 30000 }).should('be.visible')
  })

  it('groups file and query actions in compact rows that fit the panel', () => {
    cy.get('section[aria-label="File"] h2')
      .should('have.css', 'text-transform', 'none')
      .and('have.css', 'font-size', '16px')
      .and('have.css', 'font-weight', '600')
    cy.get('section[aria-label="File"]').within(() => {
      cy.contains('button', 'Upload File').should('be.visible')
        .find('[data-icon="upload"]').should('exist')
      cy.contains('button', 'Write README').should('be.visible')
      cy.get('button').should('have.length', 2)
    })
    cy.get('section[aria-label="Query"]').within(() => {
      cy.contains('button', 'DuckDB').should('be.visible')
      cy.contains('button', 'TravelTime').should('contain', 'api.traveltimeapp.com/v4')
        .and('not.contain', 'DuckDB over').find('[data-icon="global"]').should('exist')
      cy.get('button').should('have.length', 2)
    })
    cy.get('section[aria-label] button').each($row => {
      expect($row.find('[data-icon="right"]')).to.have.length(1)
      expect($row[0].scrollWidth).to.be.at.most($row[0].clientWidth)
      const icon = $row.find('.anticon').first()[0].getBoundingClientRect()
      const title = $row.find('[class*="datasetSelectorTitle"]')[0].getBoundingClientRect()
      const arrow = $row.find('[data-icon="right"]')[0].getBoundingClientRect()
      expect($row.find('[class*="datasetSelectorIcon"]')[0].getBoundingClientRect().width).to.equal(56)
      expect($row.find('[class*="datasetSelectorTitle"]').css('font-size')).to.equal('18px')
      expect(title.left).to.be.greaterThan(icon.right)
      expect(arrow.left).to.be.greaterThan(title.right)
    })
    cy.screenshot('new-dataset-panel')
    cy.viewport(900, 720)
    cy.get('section[aria-label] button').each($row => {
      expect($row[0].scrollWidth).to.be.at.most($row[0].clientWidth)
    })
    cy.contains('button', 'Add and edit connections')
      .should('have.css', 'border-top-style', 'dashed').click()
    cy.location('pathname').should('eq', '/connections')
  })

  it('opens file upload and README editing from the file rows', () => {
    cy.contains('button', 'Upload File').click()
    cy.get('input[type="file"]').should('exist')
    createReport()
    cy.contains('button', 'Write README').click()
    cy.get('.ace_editor', { timeout: 20000 }).should('be.visible')
  })

  it('opens DuckDB and initializes HTTP queries from the query rows', () => {
    cy.contains('button', 'DuckDB').click()
    cy.get('.ace_editor', { timeout: 20000 }).should('be.visible')
    createReport()
    cy.contains('button', 'TravelTime').click()
    editorShouldContain("SELECT * FROM read_json('https://api.traveltimeapp.com/v4')")
  })
})
