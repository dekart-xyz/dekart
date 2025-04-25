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
  it('should have same viz style after fork', async () => {
    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.get('button:contains("Add data from...")').click()
    cy.get('span:contains("SQL query")').click()
    cy.get('textarea').type('select 0 as lat, 0 as lon', { force: true })
    cy.get(`button:contains("${copy.execute}")`).click()
    cy.get('div:contains("1 rows")', { timeout: 20000 }).should('be.visible')

    // rename dataset
    cy.get('span[title="Dataset setting"]').click()
    cy.get('input#dekart-dataset-name-input').should('be.visible')
    const randomDatasetName = `test-${Math.floor(Math.random() * 1000000)}`
    cy.get('input#dekart-dataset-name-input').type(randomDatasetName)
    cy.get('button#dekart-save-dataset-name-button').click()
    cy.get(`span:contains("${randomDatasetName}")`).should('be.visible')

    // share report
    cy.get('button#dekart-share-report').click()
    cy.get('span:contains("Cannot view")').click()
    cy.get('div.dekart-share-view').click()
    cy.get('button').contains('Done').click()

    // change user
    cy.setCookie('dekart-dev-claim-email', 'test2@gmail.com')
    cy.reload()

    // fork report
    cy.get('button#dekart-fork-button').click()
    cy.get('span:contains("Fork of Untitled")').should('be.visible')
    cy.get('div:contains("1 rows")', { timeout: 20000 }).should('be.visible')
    cy.get(`span:contains("${randomDatasetName}")`).should('be.visible')
  })
})
