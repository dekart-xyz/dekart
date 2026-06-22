/* eslint-disable no-undef */

const sqlString = (value) => `'${value.replace(/'/g, "''")}'`

const waitForWorkspaceSourceSaved = (workspaceName, retries = 20) => {
  cy.psql(`
    SELECT COUNT(*)
    FROM workspaces w
    JOIN workspace_log wl ON wl.workspace_id = w.id
    JOIN track_events te ON te.email = wl.email
    WHERE w.name = ${sqlString(workspaceName)}
      AND wl.status = 1
      AND te.event_name = 'CreateWorkspaceFormSourceMattForrest'
  `)
    .its('stdout')
    .then((stdout) => {
      const count = Number(stdout.trim())
      if (count > 0) {
        expect(count).to.be.greaterThan(0)
        return
      }
      if (retries === 0) {
        expect(count).to.be.greaterThan(0)
        return
      }
      cy.wait(1000)
      waitForWorkspaceSourceSaved(workspaceName, retries - 1)
    })
}

describe('cloud workspace source tracking', () => {
  it('saves the selected source on workspace submit', () => {
    const workspaceName = `source-test-${Date.now()}`
    cy.stubGoogleOAuthToken('DEV_REFRESH_TOKEN', '/workspace/create')

    cy.psql(`
      INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role)
      SELECT DISTINCT workspace_id, email, 2, email, gen_random_uuid(), role
      FROM workspace_log
      WHERE workspace_id <> '00000000-0000-0000-0000-000000000000'
    `)
    cy.psql(`
      DELETE FROM track_events
      WHERE event_name = 'CreateWorkspaceFormSourceMattForrest'
    `)

    cy.clearLocalStorage()
    cy.window().then((win) => {
      win.sessionStorage.clear()
    })

    cy.visit('/workspace/create')
    cy.get('input#name', { timeout: 30000 }).clear().type(workspaceName)
    cy.get('#source').click()
    cy.get('.ant-select-item-option').contains('Matt Forrest').click()
    cy.get('button:contains("Create")').click()

    waitForWorkspaceSourceSaved(workspaceName)
  })
})
