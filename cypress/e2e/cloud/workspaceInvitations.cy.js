// Regression: Mixed-case email, the Personal trial gate, and copied links blocked workspace invitations.
/* eslint-disable no-undef */

describe('workspace invitations', () => {
  const adminEmail = 'admin@example.com'
  const memberEmail = 'teammate@example.com'
  const workspaceId = '00000000-0000-0000-0000-000000000601'
  const inviteId = '00000000-0000-0000-0000-000000000602'
  const personalId = '00000000-0000-0000-0000-000000000603'

  beforeEach(() => {
    cy.resetCloudTestDatabase()
    cy.psql(`
      INSERT INTO workspaces (id, name) VALUES ('${workspaceId}', 'Invited workspace');
      INSERT INTO workspace_log (id, workspace_id, email, status, authored_by, role, created_at)
      VALUES ('00000000-0000-0000-0000-000000000604', '${workspaceId}', '${adminEmail}', 1, '${adminEmail}', 1, NOW() - INTERVAL '1 year'),
             ('${inviteId}', '${workspaceId}', 'Teammate@example.com', 1, '${adminEmail}', 2, NOW());
      INSERT INTO subscription_log (workspace_id, authored_by, plan_type, trial_ends_at)
      VALUES ('${workspaceId}', '${adminEmail}', 6, NOW() + INTERVAL '1 year');
    `)
    cy.setDevClaimsEmail(memberEmail)
  })

  it('finds and accepts an existing mixed-case invitation with a lowercase login', () => {
    cy.visit('/workspace/join')
    cy.contains('Join Invited workspace', { timeout: 30000 }).should('be.visible')
    cy.contains('button', 'Accept').click()
    cy.get('#dekart-create-report', { timeout: 30000 }).should('be.enabled')
    cy.reload()
    cy.get('#dekart-create-report', { timeout: 30000 }).should('be.enabled')
    cy.visit('/workspace/members')
    cy.contains('[class*="memberItem"]', 'Teammate@example.com').should('contain', 'Active')
    cy.contains('[class*="memberItem"]', 'Teammate@example.com').should('contain', 'Editor')
  })

  // Both entry points must work while the current Personal workspace is still gated.
  for (const path of ['/workspace/join', `/workspace/invite/${inviteId}`]) {
    it(`accepts an invitation at ${path} without starting the Personal trial`, () => {
      cy.psql(`
        ${path === '/workspace/join' ? `UPDATE workspace_log SET email = '${memberEmail}' WHERE id = '${inviteId}';` : ''}
        INSERT INTO workspaces (id, name) VALUES ('${personalId}', 'Personal');
        INSERT INTO workspace_log (id, workspace_id, email, status, authored_by, role)
        VALUES ('00000000-0000-0000-0000-000000000605', '${personalId}', '${memberEmail}', 1, '${memberEmail}', 1);
        INSERT INTO subscription_log (workspace_id, authored_by, plan_type)
        VALUES ('${personalId}', '${memberEmail}', 1);
      `)
      cy.visit('/workspace/trial', {
        onBeforeLoad (win) {
          win.localStorage.setItem('dekart-local-storage-v1', JSON.stringify({ preferredWorkspaceId: personalId }))
          win.sessionStorage.setItem('dekart-session-storage-v1', JSON.stringify({ preferredWorkspaceId: personalId }))
        }
      })
      cy.contains('Your 14-day trial', { timeout: 30000 }).should('be.visible')
      cy.visit(path)
      cy.contains('Join Invited workspace', { timeout: 30000 }).should('be.visible')
      cy.contains('button', 'Accept').click()
      cy.get('#dekart-create-report', { timeout: 30000 }).should('be.enabled')
      cy.visit('/workspace')
      cy.get('input#name').should('have.value', 'Invited workspace')
      cy.psql(`SELECT plan_type FROM subscription_log WHERE workspace_id = '${personalId}'`)
        .its('stdout').should('match', /^1\s*$/)
    })
  }

  it('keeps an accepted mixed-case admin from changing or removing their own membership', () => {
    cy.psql(`
      UPDATE workspace_log SET role = 1 WHERE id = '${inviteId}';
      INSERT INTO confirmation_log (workspace_log_id, accepted, authored_by)
      VALUES ('${inviteId}', TRUE, '${memberEmail}');
    `)
    cy.visit('/workspace/members')
    cy.contains('[class*="memberItem"]', 'Teammate@example.com', { timeout: 30000 })
      .find('.ant-select').should('have.class', 'ant-select-disabled')
    cy.contains('[class*="memberItem"]', 'Teammate@example.com')
      .contains('button', 'Remove').should('be.disabled')
  })

  it('copies a canonical invitation link from Members even with query and hash', () => {
    let copiedText
    cy.setDevClaimsEmail(adminEmail)
    cy.visit('/workspace/members?ref=invite#members', {
      onBeforeLoad (win) {
        cy.stub(win.document, 'execCommand').callsFake(command => {
          if (command === 'copy') {
            copiedText = win.getSelection().toString()
          }
          return true
        }).as('copy')
      }
    })
    cy.contains('button', 'Copy invite link', { timeout: 30000 }).click()
    cy.get('@copy').should('have.been.calledWith', 'copy')
    cy.then(() => expect(copiedText).to.equal(`${new URL(Cypress.config('baseUrl')).origin}/workspace/invite/${inviteId}`))
    cy.contains('Invite link copied to clipboard').should('be.visible')
  })
})
