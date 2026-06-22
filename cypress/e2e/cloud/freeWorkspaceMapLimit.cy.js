/* eslint-disable no-undef */

describe('free workspace map limit', () => {
  beforeEach(() => {
    cy.resetCloudTestDatabase()
    cy.setDevClaimsEmail('free-limit@example.com')
    cy.visit('/')
    cy.ensureTestWorkspace()
  })

  it('allows three active maps and opens trial modal for the fourth', () => {
    cy.psql(`
      WITH workspace AS (
        SELECT workspace_id
        FROM workspace_log
        WHERE email = 'free-limit@example.com'
        ORDER BY created_at DESC
        LIMIT 1
      )
      INSERT INTO reports (id, author_email, workspace_id, title, archived, is_playground)
      SELECT '00000000-0000-0000-0000-000000000101'::uuid, 'free-limit@example.com', workspace_id, 'Active map 1', false, false FROM workspace
      UNION ALL
      SELECT '00000000-0000-0000-0000-000000000102'::uuid, 'free-limit@example.com', workspace_id, 'Active map 2', false, false FROM workspace
      UNION ALL
      SELECT '00000000-0000-0000-0000-000000000103'::uuid, 'free-limit@example.com', workspace_id, 'Archived map', true, false FROM workspace;
    `)

    cy.get('button#dekart-create-report').click()
    cy.location('pathname', { timeout: 30000 }).should('match', /^\/reports\/[0-9a-f-]+(\/source)?$/)

    cy.visit('/')
    cy.get('button#dekart-create-report').click()
    cy.contains("You've reached 3 free maps", { timeout: 30000 }).should('be.visible')
    cy.contains('Get unlimited maps for 14 days free').should('be.visible')
  })
})
