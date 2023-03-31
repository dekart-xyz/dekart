/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

async function getColorAtMapCenter (win) {
  const { imageDataUri, mapH, mapW } = await win.dekartMapScreenshot()
  const img = await new Promise((resolve) => {
    const img = new Image()
    img.width = mapW
    img.height = mapH
    img.onload = () => resolve(img)
    img.src = imageDataUri
  })
  const c = document.createElement('canvas')
  c.width = mapW
  c.height = mapH
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const imageData = ctx.getImageData(Math.trunc(mapW / 2), Math.trunc(mapH / 2), 1, 1).data
  return imageData.join(',')
}

describe('fork', () => {
  it('should have same viz style after fork', () => {
    let originalColor
    cy.visit('/')
    cy.get(`button:contains("${copy.create_report}")`).click()
    cy.get(`button:contains("${copy.snowflake_query}")`).should('be.visible')
    cy.get(`button:contains("${copy.snowflake_query}")`).click()
    cy.get('textarea').type('select 0 as lat, 0 as lon', { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get('div:contains("1 rows")', { timeout: 20000 }).should('be.visible')
    cy.window().then(async (win) => {
      if (!Cypress.env('CI')) {
        originalColor = await getColorAtMapCenter(win)
        expect(originalColor).to.be.a('string')
      }
    })
    cy.get('button#dekart-save-button').should('contain', 'Save')
    cy.get('button#dekart-save-button').click()
    cy.get('button#dekart-save-button').should('not.contain', 'Save*')
    cy.get('button#dekart-save-button').should('contain', 'Save')
    cy.get('button#dekart-fork-button').click()
    cy.get('#dekart-query-status-message').should('be.empty')
    cy.get(`button:contains("${copy.execute}")`).should('be.enabled')
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get('div:contains("1 rows")', { timeout: 20000 }).should('be.visible')
    cy.window().then(async (win) => {
      if (!Cypress.env('CI')) {
        const color = await getColorAtMapCenter(win)
        expect(color).to.be.a('string')
        expect(color).to.equal(originalColor)
      }
    })
  })
})
