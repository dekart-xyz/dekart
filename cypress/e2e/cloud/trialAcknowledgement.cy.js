/* eslint-disable no-undef */

describe('Cloud trial acknowledgement', () => {
  const email = 'trial-ack@example.com'

  beforeEach(() => {
    cy.resetCloudTestDatabase()
    cy.setDevClaimsEmail(email)
  })

  it('requires a new workspace to start a trial before creating maps', () => {
    let delayNextWorkspaceResponse = false
    cy.intercept('POST', '**/Dekart/GetWorkspace', req => {
      const delayResponse = delayNextWorkspaceResponse
      if (delayResponse) {
        delayNextWorkspaceResponse = false
        req.alias = 'delayedWorkspace'
      }
      req.continue(res => {
        // Delay the post-create workspace details while the user stream already identifies the new workspace.
        if (delayResponse) {
          res.setDelay(8000)
        }
      })
    })
    cy.visit('/', {
      onBeforeLoad: win => {
        win.localStorage.setItem('dekart-local-storage-v1', JSON.stringify({
          preferredWorkspaceId: '00000000-0000-0000-0000-000000000399'
        }))
      }
    })
    cy.get('button#dekart-create-workspace').click()
    cy.get('input#name').type('Trial workspace')
    cy.get('#source').click()
    cy.get('.ant-select-item-option').contains('Google Search').click()
    cy.then(() => { delayNextWorkspaceResponse = true })
    cy.get('button:contains("Create")').click()

    cy.location('pathname', { timeout: 30000 }).should('equal', '/workspace/trial')
    cy.contains('Start your 14-day trial').should('be.visible')
    cy.contains('$49/month per editor').should('be.visible')
    cy.contains('$490/month').should('be.visible')
    cy.wait('@delayedWorkspace')
    cy.contains('Your 14-day trial').should('be.visible')
    cy.visit('/workspace/plan')
    cy.location('pathname').should('equal', '/workspace/plan')
    cy.contains('Grow').should('be.visible')
    cy.visit('/')
    cy.location('pathname').should('equal', '/workspace/trial')

    cy.get('button#dekart-start-trial').dblclick()
    cy.get('button#dekart-create-report', { timeout: 30000 }).should('be.visible')
    cy.visit('/workspace/plan')
    cy.contains('14 days left').should('be.visible')
    cy.contains('of your 14-day trial').should('be.visible')
    cy.contains('When the trial ends, your workspace becomes read-only and your maps stay viewable.').should('be.visible')
    cy.contains('button', 'Upgrade').should('be.visible')
    cy.psql(`
      SELECT COUNT(*)
      FROM subscription_log
      WHERE authored_by = '${email}' AND plan_type = 6
    `).its('stdout').should('match', /^1\s*$/)
    cy.psql(`
      UPDATE subscription_log
      SET trial_ends_at = NOW() - INTERVAL '1 minute'
      WHERE authored_by = '${email}' AND plan_type = 6
    `)
    cy.visit('/')
    cy.contains('Workspace is read-only.').should('be.visible')
    cy.contains('Your trial has ended. Your maps stay viewable.').should('be.visible')
    cy.contains('button', 'See plans').should('be.visible')
    cy.contains('a', 'Book a call').should('be.visible')
    cy.contains('button', 'See plans').click()
    cy.location('pathname').should('equal', '/workspace/plan')
    cy.contains('Your trial has ended').should('be.visible')
    cy.contains('The workspace is read-only and your maps stay viewable. Upgrade below to start editing again, or book a call to extend the trial.').should('be.visible')
    cy.contains('a', 'Book a call').should('be.visible')
    cy.contains('0 days left').should('not.exist')
    cy.contains('Trial ended — workspace is paused.').should('not.exist')
  })

  it('shows members an admin-only gate without a start action', () => {
    const adminEmail = 'trial-admin@example.com'
    cy.psql(`
      WITH workspace AS (
        INSERT INTO workspaces (id, name)
        VALUES ('00000000-0000-0000-0000-000000000301', 'Personal workspace')
        RETURNING id
      )
      INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role)
      SELECT id, '${adminEmail}', 1, '${adminEmail}', '00000000-0000-0000-0000-000000000302'::uuid, 1 FROM workspace
      UNION ALL
      SELECT id, '${email}', 1, '${email}', '00000000-0000-0000-0000-000000000303'::uuid, 2 FROM workspace;

      INSERT INTO subscription_log (workspace_id, authored_by, plan_type)
      VALUES ('00000000-0000-0000-0000-000000000301', '${adminEmail}', 1);
    `)

    cy.visit('/')
    cy.location('pathname', { timeout: 30000 }).should('equal', '/workspace/trial')
    cy.contains('Ask your workspace admin to start the trial').should('be.visible')
    cy.get('button#dekart-start-trial').should('not.exist')

    cy.psql(`
      UPDATE subscription_log
      SET plan_type = 6, trial_ends_at = NOW() - INTERVAL '1 minute'
      WHERE workspace_id = '00000000-0000-0000-0000-000000000301'
    `)
    cy.visit('/workspace/plan')
    cy.contains('Your trial has ended').should('be.visible')
    cy.contains('Ask your workspace admin to upgrade, or book a call to extend the trial.').should('be.visible')
    cy.contains('button', 'Upgrade').should('be.disabled')
  })

  it('keeps the legacy Team plan fully available', () => {
    // Stripe test subscription sub_1UGcKGCnpQUpbHMF71A3sEY4 belongs to this shared read-only fixture customer.
    const legacyTeamCustomerId = 'cus_VHALvFVvwmmmGA'
    cy.psql(`
      WITH workspace AS (
        INSERT INTO workspaces (id, name)
        VALUES ('00000000-0000-0000-0000-000000000401', 'Legacy Team')
        RETURNING id
      )
      INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role)
      SELECT id, '${email}', 1, '${email}', '00000000-0000-0000-0000-000000000402'::uuid, 1 FROM workspace;

      INSERT INTO subscription_log (workspace_id, customer_id, authored_by, plan_type)
      VALUES ('00000000-0000-0000-0000-000000000401', '${legacyTeamCustomerId}', '${email}', 2);

      INSERT INTO reports (id, title, author_email, workspace_id)
      VALUES (
        '00000000-0000-0000-0000-000000000403',
        'Legacy Team map',
        '${email}',
        '00000000-0000-0000-0000-000000000401'
      );
    `)

    cy.visit('/')
    cy.contains('Legacy Team map', { timeout: 30000 }).should('be.visible')
    cy.get('button#dekart-create-report').should('be.visible').and('not.be.disabled').click()
    cy.location('pathname').should('match', /^\/reports\/[a-f0-9-]+\/source$/)
    cy.get('#dekart-add-connection').should('be.visible')

    cy.visit('/workspace/plan')
    cy.contains('Team').should('be.visible')
    cy.contains('button', 'Manage subscription').should('be.visible').and('not.be.disabled')
    cy.contains('Workspace is read-only.').should('not.exist')
  })

})
