/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

describe('dataset source write timeout', () => {
  it('downloads a dataset that keeps streaming beyond the server timeout', () => {
    const query = "SELECT rows.i AS id, repeat('x', 8192) AS padding, 13.4 AS longitude, 52.5 AS latitude FROM generate_series(1, 6) AS rows(i) CROSS JOIN LATERAL (SELECT pg_sleep(0.3) WHERE rows.i IS NOT NULL) AS delay"

    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.get('button:contains("Run SQL")').click()
    cy.get('textarea').click({ force: true }).type(query, { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()

    cy.get('div:contains("6 rows")', { timeout: 20000 }).should('be.visible')
    cy.contains('Network error when downloading dataset').should('not.exist')
  })
})
