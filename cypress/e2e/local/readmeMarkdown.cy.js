/* eslint-disable no-undef */

describe('report Readme Markdown', () => {
  it('renders GFM tables with formatting, alignment, and contained overflow', () => {
    const appUrl = Cypress.config('baseUrl')
    const markdown = `# Table example

| Left | Center | Right |
| :--- | :----: | ----: |
| **bold** | *emphasis* | [Dekart](https://dekart.xyz) |
| \`inline code\` | ${'widecontent'.repeat(80)} | 42 |

Malformed | table
still readable`

    cy.visit(`${appUrl}/`)
    cy.get('body', { timeout: 20000 }).then(($body) => {
      // Support both fresh no-config onboarding and an already initialized workspace.
      if ($body.text().includes('Ready to connect')) {
        cy.contains('button', 'Use file upload').click()
      } else {
        cy.get('button#dekart-create-report', { timeout: 20000 }).click()
      }
    })

    cy.contains('button', 'Write README', { timeout: 20000 }).click()
    cy.contains('[role="tab"]', 'Readme', { timeout: 20000 }).click()
    cy.get('#AceEditor').should('be.visible').then(($editor) => {
      $editor[0].env.editor.setValue(markdown, -1)
    })
    cy.contains('button', 'Preview').click()

    cy.get('#dekart-readme-preview table').should('have.length', 1).within(() => {
      cy.get('thead th').should('have.length', 3)
      cy.get('tbody tr').should('have.length', 2)
      cy.get('th').eq(0).should('have.css', 'text-align', 'left')
      cy.get('th').eq(1).should('have.css', 'text-align', 'center')
      cy.get('th').eq(2).should('have.css', 'text-align', 'right')
      cy.get('strong').should('have.text', 'bold')
      cy.get('em').should('have.text', 'emphasis')
      cy.get('a').should('have.attr', 'href', 'https://dekart.xyz')
      cy.get('code').should('have.text', 'inline code')
    })

    cy.get('#dekart-readme-preview table').parent().should(($tableWrapper) => {
      expect($tableWrapper[0].scrollWidth).to.be.greaterThan($tableWrapper[0].clientWidth)
      expect($tableWrapper[0].scrollHeight).to.be.at.most($tableWrapper[0].clientHeight)
    })
    cy.get('#dekart-readme-preview table').should(($table) => {
      expect($table[0].scrollHeight).to.be.at.most($table[0].clientHeight)
    })
    cy.contains('Malformed | table').should('be.visible')
    cy.contains('still readable').should('be.visible')
    cy.screenshot('readme-markdown-table')
  })
})
