/* eslint-disable no-undef */

describe('pg-s3 expired license member roles', () => {
  it('allows an admin to change another member role while membership controls stay disabled', () => {
    const adminEmail = 'license-expired-admin@example.com'
    const memberEmail = 'license-expired-member@example.com'

    cy.resetCloudTestDatabase()
    cy.setDevClaimsEmail(adminEmail)
    cy.visit('/workspace/members')
    cy.contains('License key expired', { timeout: 30000 }).should('be.visible')

    cy.psql(`
      INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role)
      VALUES (
        '00000000-0000-0000-0000-000000000000',
        '${memberEmail}',
        1,
        '${memberEmail}',
        '00000000-0000-0000-0000-000000000204'::uuid,
        2
      )
    `)
    cy.reload()

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
      WHERE workspace_id = '00000000-0000-0000-0000-000000000000'
        AND email = '${memberEmail}'
      ORDER BY created_at DESC
      LIMIT 1
    `).its('stdout').should('match', /^3\s*$/)
  })
})
