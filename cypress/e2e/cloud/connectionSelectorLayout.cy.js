/* eslint-disable no-undef */
import { createReport } from '../local/duckdbHelpers'

const email = `connection-layout-${Date.now()}@dekart.xyz`
const warehouses = ['bigquery', 'snowflake', 'wherobots', 'postgres']

describe('connection selector layout', () => {
  before(() => {
    cy.setDevClaimsEmail(email)
    cy.visit('/')
    cy.ensureTestWorkspace()
    createReport()
  })

  beforeEach(() => {
    cy.setDevClaimsEmail(email)
    cy.visit('/connections')
    cy.get('#dekart-connection-type-card-http', { timeout: 30000 }).should('be.visible')
  })

  it('groups warehouses above APIs and files with working setup actions', () => {
    cy.viewport(1280, 900)
    cy.contains('Connect your data').should('be.visible')
    cy.contains('We run queries there; nothing is copied to Dekart.').should('not.exist')
    cy.get('.ant-result-icon .anticon').should('have.css', 'font-size', '32px')
    cy.get('.ant-result-title').should('have.css', 'font-size', '22px')
    cy.contains('button', 'Back').should('have.length', 1).then($back => {
      const back = $back[0].getBoundingClientRect()
      cy.get('.ant-result-title').then($title => {
        expect(back.bottom).to.be.lessThan($title[0].getBoundingClientRect().top)
      })
      cy.get('#dekart-connection-type-card-bigquery').then($card => {
        expect(back.left).to.be.closeTo($card[0].getBoundingClientRect().left - 8, 1)
      })
    })
    cy.contains('section', 'Warehouses').within(() => {
      cy.get('button').should('have.length', 4)
      warehouses.forEach(key => cy.get(`#dekart-connection-type-card-${key}`).should('contain', 'Connect'))
    })
    cy.contains('section', 'APIs & files').within(() => {
      cy.get('button').should('have.length', 1)
      cy.contains('API, S3, parquet over HTTPS').should('be.visible')
    })
    cy.get('#dekart-connection-type-card-bigquery').then($first => {
      const first = $first[0].getBoundingClientRect()
      cy.get('#dekart-connection-type-card-postgres').then($last => {
        expect($last[0].getBoundingClientRect().top).to.equal(first.top)
      })
      cy.get('#dekart-connection-type-card-http').then($http => {
        const http = $http[0].getBoundingClientRect()
        expect(http.top).to.be.greaterThan(first.bottom)
        expect(http.width).to.be.closeTo(first.width, 1)
      })
    })
    warehouses.forEach(key => {
      cy.get(`#dekart-connection-type-card-${key}`).click()
      cy.get('.ant-modal:visible').should('have.length', 1).find('.ant-modal-title')
        .should('contain', key === 'bigquery' ? 'Choose BigQuery Connection Method' : key === 'postgres' ? 'Postgres' : key === 'snowflake' ? 'Snowflake' : 'Wherobots')
      cy.get('.ant-modal:visible .ant-modal-close').click()
      cy.get('.ant-modal').should('not.be.visible')
    })
    cy.get('#dekart-connection-type-card-http').click()
    cy.get('.ant-modal:visible .ant-modal-title').should('contain', 'HTTP source')
    cy.get('#httpBaseUrl').should('be.visible')
    cy.get('.ant-modal:visible .ant-modal-close').click()
    cy.get('#dekart-more-warehouses').click()
    cy.contains('.ant-modal-title', 'Which database do you use?').should('be.visible')
  })

  it('fits four, two and one warehouse columns as the page narrows', () => {
    ;[1280, 700, 375].forEach((width, index) => {
      cy.viewport(width, 900)
      cy.contains('section', 'Warehouses').scrollIntoView()
      cy.contains('section', 'Warehouses').find('button').should($cards => {
        const rects = [...$cards].map(card => card.getBoundingClientRect())
        const columns = [4, 2, 1][index]
        expect(rects.filter(rect => rect.top === rects[0].top)).to.have.length(columns)
        rects.forEach(rect => {
          expect(rect.left).to.be.at.least(0)
          expect(rect.right).to.be.at.most(width)
        })
      })
      cy.get('#dekart-more-warehouses').scrollIntoView().should('be.visible').then($button => {
        expect($button[0].getBoundingClientRect().right).to.be.at.most(width)
      })
    })
    cy.contains('Connect your data').parents().filter((index, element) => {
      return getComputedStyle(element).overflowY === 'scroll'
    }).scrollTo('top', { ensureScrollable: false })
    cy.screenshot('connection-selector-mobile', { capture: 'fullPage' })
    cy.viewport(1280, 900)
    cy.contains('Connect your data').parents().filter((index, element) => {
      return getComputedStyle(element).overflowY === 'scroll'
    }).scrollTo('top', { ensureScrollable: false })
    cy.screenshot('connection-selector-desktop')
  })

  it('uses the same blue globe for HTTP setup and saved connections', () => {
    cy.get('#dekart-connection-type-card-http [data-icon="global"]')
      .should('be.visible')
    cy.get('#dekart-connection-type-card-http').click()
    cy.get('#connectionName').clear().type('HTTP icon regression')
    cy.get('#httpBaseUrl').type('https://example.com/data/')
    cy.get('#saveConnection').click()
    cy.get('.ant-modal:visible').should('not.exist')
    cy.contains('[class*="connectionCardTitle"]', 'HTTP icon regression', { timeout: 20000 }).parent().within(() => {
      cy.get('[data-icon="global"]').should('be.visible')
        .parent().should('have.css', 'color', 'rgb(24, 144, 255)')
      cy.get('[data-icon="console-sql"]').should('not.exist')
    })
    cy.get('#dekart-new-connection-connections').click()
    cy.get('#dekart-connection-type-card-http').should('be.visible')
    cy.contains('button', 'Back').click()
    cy.contains('[class*="connectionCardTitle"]', 'HTTP icon regression').should('be.visible')
    cy.get('#dekart-connection-type-card-http').should('not.exist')
  })
})
