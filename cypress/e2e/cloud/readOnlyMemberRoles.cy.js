/* eslint-disable no-undef */

describe('read-only workspace member roles', () => {
  const adminEmail = 'read-only-admin@example.com'
  const memberEmail = 'read-only-member@example.com'

  beforeEach(() => {
    cy.resetCloudTestDatabase()
    cy.psql(`
      WITH workspace AS (
        INSERT INTO workspaces (id, name)
        VALUES ('00000000-0000-0000-0000-000000000201', 'Expired trial workspace')
        RETURNING id
      )
      INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role)
      SELECT id, '${adminEmail}', 1, '${adminEmail}', '00000000-0000-0000-0000-000000000202'::uuid, 1 FROM workspace
      UNION ALL
      SELECT id, '${memberEmail}', 1, '${memberEmail}', '00000000-0000-0000-0000-000000000203'::uuid, 2 FROM workspace;

      INSERT INTO subscription_log (workspace_id, authored_by, plan_type, trial_ends_at)
      VALUES ('00000000-0000-0000-0000-000000000201', '${adminEmail}', 6, NOW() - INTERVAL '1 day');
    `)
    cy.setDevClaimsEmail(adminEmail)
    cy.visit('/workspace/members')
  })

  it('lets an admin downgrade another member while membership controls stay disabled', () => {
    cy.contains('Expired trial workspace', { timeout: 30000 }).should('be.visible')
    cy.contains('[class*="memberItem"]', adminEmail)
      .find('.ant-select')
      .should('have.class', 'ant-select-disabled')
    cy.contains('[class*="memberItem"]', memberEmail)
      .find('.ant-select')
      .should('not.have.class', 'ant-select-disabled')
      .click()
    cy.get('.ant-select-item-option').contains('Viewer').click()
    cy.contains('Role updated', { timeout: 30000 }).should('be.visible')

    cy.contains('button', 'Invite user').should('be.disabled')
    cy.contains('[class*="memberItem"]', memberEmail).contains('button', 'Remove').should('be.disabled')
    cy.psql(`
      SELECT role
      FROM workspace_log
      WHERE workspace_id = '00000000-0000-0000-0000-000000000201'
        AND email = '${memberEmail}'
      ORDER BY created_at DESC
      LIMIT 1
    `).its('stdout').should('match', /^3\s*$/)
  })
})
