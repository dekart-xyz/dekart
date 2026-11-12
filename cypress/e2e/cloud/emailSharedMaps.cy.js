// Critical path: member sees maps shared with them by email in Shared Maps
/* eslint-disable no-undef */

const workspaceId = '00000000-0000-0000-0000-000000000711'
const reportId = '00000000-0000-0000-0000-000000000712'
const authorEmail = 'email-share-author@example.com'
const memberEmail = 'email-share-member@example.com'
const title = 'Map shared by email'

// Wait for the member's own map so absence checks run after the report list loads.
function visitMemberHome () {
  cy.setDevClaimsEmail(memberEmail)
  cy.visit('/')
  cy.contains('.dekart-map-card', 'Member map', { timeout: 30000 }).should('be.visible')
  cy.contains('.ant-radio-button-wrapper', 'Shared Maps').click()
}

describe('email-shared maps in Shared Maps', () => {
  beforeEach(() => {
    cy.resetCloudTestDatabase()
    cy.psql(`
      INSERT INTO workspaces (id, name) VALUES ('${workspaceId}', 'Email sharing');
      INSERT INTO workspace_log (id, workspace_id, email, status, authored_by, role)
      VALUES (gen_random_uuid(), '${workspaceId}', '${authorEmail}', 1, '${authorEmail}', 1),
             (gen_random_uuid(), '${workspaceId}', '${memberEmail}', 1, '${memberEmail}', 2);
      INSERT INTO subscription_log (workspace_id, authored_by, plan_type, trial_ends_at)
      VALUES ('${workspaceId}', '${authorEmail}', 6, NOW() + INTERVAL '1 year');
      INSERT INTO reports (id, workspace_id, author_email, title, discoverable, allow_edit)
      VALUES ('${reportId}', '${workspaceId}', '${authorEmail}', '${title}', FALSE, FALSE),
             (gen_random_uuid(), '${workspaceId}', '${memberEmail}', 'Member map', FALSE, FALSE);
    `)
  })

  it('lets the recipient find and open the map while keeping the author tabs unchanged', () => {
    cy.psql(`
      INSERT INTO report_access_log (report_id, email, status, authored_by)
      VALUES ('${reportId}', '${memberEmail}', 1, '${authorEmail}');
    `)
    visitMemberHome()
    cy.contains('.dekart-map-card', title, { timeout: 30000 }).should('be.visible')
      .and('contain.text', 'Shared').click()
    cy.location('pathname').should('eq', `/reports/${reportId}`)
    cy.contains(title, { timeout: 30000 }).should('be.visible')

    cy.setDevClaimsEmail(authorEmail)
    cy.visit('/')
    cy.contains('.dekart-map-card', title, { timeout: 30000 }).should('be.visible')
    cy.contains('.ant-radio-button-wrapper', 'Shared Maps').click()
    cy.contains('.dekart-map-card', title).should('not.exist')
    cy.contains('.ant-radio-button-wrapper', 'My Maps').click()
    cy.contains('.dekart-map-card', title).should('be.visible')
  })

  it('keeps a public map without workspace or email access out of Shared Maps but opens it by link', () => {
    cy.psql(`UPDATE reports SET is_public=TRUE WHERE id='${reportId}';`)
    visitMemberHome()
    cy.contains('.dekart-map-card', title).should('not.exist')
    cy.visit(`/reports/${reportId}`)
    cy.location('pathname').should('eq', `/reports/${reportId}`)
    cy.contains(title, { timeout: 30000 }).should('be.visible')
  })
})
