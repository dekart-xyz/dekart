// Critical path: a Cloud workspace member creates a second workspace
/* eslint-disable no-undef */

describe('Additional Cloud workspace', () => {
  const workspaceId = '00000000-0000-0000-0000-000000000801'
  const membershipId = '00000000-0000-0000-0000-000000000802'
  const adminEmail = 'additional-workspace-admin@example.com'
  const editorEmail = 'additional-workspace-editor@example.com'

  beforeEach(() => {
    cy.resetCloudTestDatabase()
    cy.psql(`
      INSERT INTO workspaces (id, name) VALUES ('${workspaceId}', 'Open EV Data');
      INSERT INTO workspace_log (id, workspace_id, email, status, authored_by, role)
      VALUES (gen_random_uuid(), '${workspaceId}', '${adminEmail}', 1, '${adminEmail}', 1),
             ('${membershipId}', '${workspaceId}', '${editorEmail}', 1, '${adminEmail}', 2);
      INSERT INTO confirmation_log (workspace_log_id, accepted, authored_by)
      VALUES ('${membershipId}', TRUE, '${editorEmail}');
      INSERT INTO subscription_log (workspace_id, authored_by, plan_type, trial_ends_at)
      VALUES ('${workspaceId}', '${adminEmail}', 6, NOW() + INTERVAL '14 days');
    `)
    cy.setDevClaimsEmail(editorEmail)
  })

  it('lets an accepted editor create and switch to their own workspace', () => {
    cy.visit('/workspace')
    cy.contains('[class*="workspaceSelector"] .ant-select-selection-item', 'Open EV Data', { timeout: 30000 }).click()
    cy.contains('.ant-select-dropdown', 'Create Workspace').should('be.visible').click()
    cy.location('pathname').should('eq', '/workspace/create')
    cy.get('input[placeholder="Workspace name"]').clear().type('My new workspace')
    cy.contains('label', 'Where did you first hear about Dekart?').should('be.visible')
    cy.get('#source').click()
    cy.contains('.ant-select-item-option', 'Google Search').click()
    cy.contains('button', 'Create Workspace').click()
    cy.location('pathname', { timeout: 30000 }).should('eq', '/workspace/trial')
    cy.contains('Your 14-day trial').should('be.visible')
    cy.contains('[class*="workspaceSelector"] .ant-select-selection-item', 'My new workspace').should('be.visible')
  })
})
