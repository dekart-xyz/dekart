/* global cy, describe, it, Cypress, expect */

function uploadCsv (name, rows, addDataset = false) {
  if (addDataset) cy.get('.ant-tabs-nav-add:visible').last().click()
  cy.contains('button', 'Upload File', { timeout: 30000 }).click()
  cy.get('input[type="file"]').selectFile({
    contents: Cypress.Buffer.from(`latitude,longitude,category,amount\n${rows.join('\n')}\n`),
    fileName: name,
    mimeType: 'text/csv'
  }, { force: true })
  cy.contains('button', /^Upload$/).click()
  cy.contains('Ready', { timeout: 120000 }).should('be.visible')
}

function openWidgets () {
  cy.get('[data-testid="widgets-tab"]', { timeout: 30000 }).then(button => {
    if (button.attr('aria-expanded') !== 'true') cy.wrap(button).click()
  })
}

// Exercise the same primary-pointer sequence dnd-kit receives from a visible widget header.
function dragFirstWidgetBelowSecond () {
  cy.get('[aria-label^="Move "]').then(handles => {
    const source = handles[0]
    const target = handles[1]
    const sourceRect = source.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const view = source.ownerDocument.defaultView
    const pointer = { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, view, force: true }
    cy.wrap(source).trigger('pointerdown', { ...pointer, clientX: sourceRect.left + 12, clientY: sourceRect.top + 12 })
    cy.get('body').trigger('pointermove', { ...pointer, buttons: 1, clientX: sourceRect.left + 12, clientY: sourceRect.top + 24 })
    cy.wait(50)
    cy.get('body').trigger('pointermove', { ...pointer, buttons: 1, clientX: targetRect.left + 12, clientY: targetRect.top + targetRect.height / 2 })
    cy.wait(50)
    cy.get('body').trigger('pointerup', { ...pointer, clientX: targetRect.left + 12, clientY: targetRect.top + targetRect.height / 2 })
  })
}

describe('Widgets dataset lifecycle', () => {
  it('creates defaults for each UI dataset, isolates filters, and keeps viewer edits local', () => {
    cy.viewport(1280, 960)
    const email = `widgets-datasets-${Date.now()}@example.com`
    cy.setDevClaimsEmail(email)
    cy.intercept(`${Cypress.env('DEKART_E2E_API_URL')}/api/v1/**`, request => { request.headers['X-Dekart-Claim-Email'] = email })
    cy.visit('/')
    cy.ensureTestWorkspace()
    cy.get('#dekart-create-report').click()

    uploadCsv('dataset-a.csv', ['52.1,13.1,North,10', '52.2,13.2,North,20', '52.3,13.3,South,30', '52.4,13.4,South,40'])
    cy.get('[data-testid="number-value"]', { timeout: 180000 }).should('have.text', '4')
    uploadCsv('dataset-b.csv', ['53.1,14.1,Open,5', '53.2,14.2,Closed,15', '53.3,14.3,Closed,25'], true)
    openWidgets()

    cy.get('[data-testid="widget-item"]', { timeout: 180000 }).should('have.length.at.least', 2)
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.length', 2).should(values => {
      const text = [...values].map(value => value.textContent)
      if (!text.includes('4') || !text.includes('3')) throw new Error(`Expected independent totals 4 and 3, got ${text.join(', ')}`)
    })
    let draggedLabel
    let targetLabel
    cy.get('[aria-label^="Move "]').then(handles => {
      draggedLabel = handles[0].getAttribute('aria-label')
      targetLabel = handles[1].getAttribute('aria-label')
      expect(draggedLabel).not.to.equal(targetLabel)
    })
    dragFirstWidgetBelowSecond()
    cy.get('[id^="DndLiveRegion"]').invoke('text').should('include', 'Moved')
    cy.get('[aria-label^="Move "]').should(handles => {
      expect(handles[0].getAttribute('aria-label')).to.equal(targetLabel)
      expect(handles[1].getAttribute('aria-label')).to.equal(draggedLabel)
    })
    cy.get('[data-testid="category-chart"]').eq(1).find('g[aria-label="rule"][data-index="4"] line', { timeout: 30000 }).first().click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).eq(1).should('have.text', '1')
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).eq(0).should('have.text', '4')
    cy.contains('button', 'Clear all').click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).eq(1).should('have.text', '3')

    // Leave immediately: the mode transition must flush the pending authored
    // defaults instead of relying on the one-second autosave debounce.
    cy.contains('.ant-select', 'Editing').click()
    cy.contains('.ant-select-item-option-content', 'Viewing').click()
    cy.location('pathname').should('not.match', /\/source$/)
    cy.get('[data-testid="number-value"]', { timeout: 180000 }).should('have.length', 2)
    cy.get('[data-testid="category-chart"]').eq(0).find('g[aria-label="rule"][data-index="4"] line', { timeout: 30000 }).first().click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).eq(0).should('have.text', '2')
    cy.contains('button', 'Add chart').click()
    cy.contains('button', /^Number/).click()
    cy.contains('button', /^Create$/).click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.length', 3)
    cy.contains('.ant-select', 'Viewing').click()
    cy.contains('.ant-select-item-option-content', 'Editing').click()
    cy.location('pathname').should('match', /\/source$/)
    cy.get('[data-testid="number-value"]', { timeout: 180000 }).should('have.length', 2)
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).eq(0).should('have.text', '4')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'No filters')
    cy.reload()
    openWidgets()
    cy.get('[data-testid="number-value"]', { timeout: 180000 }).should('have.length', 2)
    cy.get('[data-testid="category-chart"]').eq(1).find('g[aria-label="rule"][data-index="4"] line', { timeout: 30000 }).first().click()
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).eq(1).should('have.text', '1')
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'category')

    cy.get('button[aria-label="Chart actions"]').first().click()
    cy.contains('[role="menuitem"]', 'Edit chart').click()
    cy.get('[data-testid="widget-settings-dataset"]').should('be.visible').and('not.have.prop', 'tagName', 'SELECT')
    cy.get('#widget-settings-source').should('not.exist')
    cy.get('#widget-title').clear().type('Pending row count')
    cy.contains('button', 'Back to charts').click()

    cy.get('.ant-tabs-tab-remove:visible').last().click()
    cy.contains('button', 'Delete Dataset').click()
    cy.contains('.ant-modal-confirm', 'Remove dataset from map?').within(() => cy.contains('button', 'Yes').click())
    cy.contains('Dataset removed', { timeout: 30000 }).should('be.visible')
    cy.get('[data-testid="widget-item"]', { timeout: 30000 }).should('have.length.at.least', 1)
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.length', 1)
    cy.get('[data-testid="filter-strip"]').should('contain.text', 'No filters')
    cy.contains('This report changed in another session').should('not.exist')
    cy.contains('Map changed').should('not.exist')
    cy.contains('Pending row count').should('be.visible')
    cy.get('button#dekart-save-button').should('not.be.disabled').click()
    cy.get('button#dekart-save-button', { timeout: 30000 }).should('not.be.disabled')
    cy.reload()
    openWidgets()
    cy.get('[data-testid="widget-item"]', { timeout: 180000 }).should('have.length.at.least', 1)
    cy.get('[data-testid="number-value"]', { timeout: 30000 }).should('have.length', 1).and('have.text', '4')
    cy.contains('Pending row count').should('be.visible')
  })
})
