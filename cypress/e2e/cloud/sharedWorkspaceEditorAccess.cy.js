// Critical path: shared workspace, editor sees no admin data
/* eslint-disable no-undef */

const workspaceId = '00000000-0000-0000-0000-000000000701'
const adminEmail = 'shared-admin@example.com'
const editorEmail = 'shared-editor@example.com'

// Exercise the reduced workspace for both non-admin roles.
function checkWorkspace (email) {
  cy.setDevClaimsEmail(email)
  cy.visit('/workspace')
  cy.contains('Open EV Data', { timeout: 30000 }).should('be.visible')
  cy.contains('.ant-radio-button-wrapper', 'Tokens').should('be.visible').click()
  cy.location('pathname').should('eq', '/workspace/tokens')
  cy.visit('/workspace')
  cy.contains('.ant-radio-button-wrapper', 'Workspace', { timeout: 30000 }).should('be.visible')
  cy.contains('.ant-radio-button-wrapper', 'Members').should('not.exist')
  cy.contains('.ant-radio-button-wrapper', 'Plan').should('not.exist')
  cy.get('input#name, #workspaceIDReadOnly').should('not.exist')
  cy.contains('Workspace ID').should('not.exist')
  cy.contains(workspaceId).should('not.exist')
  for (const path of ['/workspace/members', '/workspace/plan']) {
    cy.visit(path)
    cy.location('pathname', { timeout: 30000 }).should('eq', '/workspace')
    cy.contains('Open EV Data').should('be.visible')
  }
}

describe('shared workspace editor access', () => {
  beforeEach(() => {
    cy.resetCloudTestDatabase()
    cy.psql(`
      INSERT INTO workspaces (id, name) VALUES ('${workspaceId}', 'Open EV Data');
      INSERT INTO workspace_log (id, workspace_id, email, status, authored_by, role)
      VALUES (gen_random_uuid(), '${workspaceId}', '${adminEmail}', 1, '${adminEmail}', 1),
             (gen_random_uuid(), '${workspaceId}', '${editorEmail}', 1, '${editorEmail}', 2),
             (gen_random_uuid(), '${workspaceId}', 'shared-viewer@example.com', 1, 'shared-viewer@example.com', 3);
      INSERT INTO subscription_log (workspace_id, authored_by, plan_type, trial_ends_at)
      VALUES ('${workspaceId}', '${adminEmail}', 6, NOW() + INTERVAL '1 year');
      INSERT INTO connections (id, workspace_id, connection_name, connection_type, bigquery_project_id, cloud_storage_bucket, author_email, is_default)
      VALUES ('00000000-0000-0000-0000-000000000702', '${workspaceId}', 'Shared BigQuery', 1, 'dekart-dev', 'dekart-dev', '${adminEmail}', TRUE);
    `)
    cy.setDevClaimsEmail(editorEmail)
  })

  it('shows only the workspace name and tokens to an editor', () => {
    checkWorkspace(editorEmail)
  })

  it('shows the same reduced workspace to a viewer', () => {
    checkWorkspace('shared-viewer@example.com')
  })

  it('hides Connections from the editor menu and redirects direct navigation', () => {
    cy.intercept('POST', '**/Dekart/GetConnectionList').as('connectionList')
    cy.visit('/workspace')
    // Connection loading changes menu entries and can move them into the overflow.
    cy.wait('@connectionList').its('response.statusCode').should('eq', 200)
    cy.contains('.ant-card-head-title', 'Workspace name', { timeout: 30000 }).should('be.visible')
    // Narrow headers move the menu into the visible overflow submenu.
    cy.get('.ant-menu-horizontal').then(menu => {
      if (!menu.find('[id="dekart-main-menu"]:visible').length) {
        cy.wrap(menu).find('.ant-menu-overflow-item-rest').trigger('mouseover', { scrollBehavior: false })
      }
    })
    // Scrolling the popup into view can close its parent overflow menu.
    cy.get('[id="dekart-main-menu"]:visible').trigger('mouseover', { scrollBehavior: false, waitForAnimations: false })
    cy.contains('a:visible', 'My Maps').should('be.visible')
    cy.get('a[href="/connections"]').should('not.exist')
    cy.visit('/connections')
    cy.location('pathname', { timeout: 30000 }).should('eq', '/')
    cy.get('#dekart-create-report').should('be.enabled')
  })

  it('lets an editor query the existing BigQuery connection and invite a typed email', () => {
    // Dev claims select the editor; the OAuth state grants the client BigQuery scopes.
    cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN')
    cy.visit('/grant-scopes')
    cy.contains('button', 'Continue to Google', { timeout: 30000 }).click()
    cy.get('#dekart-create-report', { timeout: 30000 }).click()
    cy.contains('button', 'Shared BigQuery', { timeout: 30000 }).scrollIntoView().click()
    cy.enterQuery('SELECT 52.5 AS latitude, 13.4 AS longitude')
    cy.get('#dekart-query-execute-button').should('be.enabled').click()
    cy.get('#dekart-query-status-message', { timeout: 120000 }).should('contain', 'Ready')
    cy.get('#dekart-share-report').click()
    cy.contains('Invite people (view only)').should('be.visible')
    cy.get('.ant-modal [class*="userSelect"] .ant-select-selector').click()
    cy.get('.ant-select-item-option').should('not.exist')
    cy.get('.ant-modal [class*="userSelect"] input[role="combobox"]').type('guest@example.com{enter}')
    cy.contains('.ant-select-selection-item', 'guest@example.com', { timeout: 30000 }).should('be.visible')
    cy.visit('/')
    cy.contains('.ant-radio-button-wrapper', 'My Maps', { timeout: 30000 }).should('be.visible')
    cy.contains('.ant-radio-button-wrapper', 'Connections').should('not.exist')
  })

  it('keeps admin tabs, direct routes and connection modal available while loading', () => {
    cy.setDevClaimsEmail(adminEmail)
    cy.visit('/workspace/members')
    cy.contains('.ant-radio-button-wrapper', 'Members', { timeout: 30000 }).should('be.visible')
    cy.contains('.ant-radio-button-wrapper', 'Plan').should('be.visible')
    cy.contains('[class*="memberItem"]', editorEmail).should('be.visible')
    cy.location('pathname').should('eq', '/workspace/members')
    cy.visit('/')
    cy.get('#dekart-create-report', { timeout: 30000 }).click()
    cy.location('pathname').should('match', /\/reports\/.*\/source/)
    cy.visit('/connections')
    cy.get('#dekart-new-connection-connections', { timeout: 30000 }).click()
    cy.location('pathname').should('eq', '/connections')
    cy.get('#dekart-connection-type-card-bigquery').click()
    cy.contains('.ant-modal-title', 'BigQuery').should('be.visible')
  })
})
