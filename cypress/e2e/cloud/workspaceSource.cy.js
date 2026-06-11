/* eslint-disable no-undef */

const psql = (sql, options = {}) => {
  const escaped = sql.replace(/"/g, '\\"')
  return cy.exec(
    'case "$DEKART_POSTGRES_HOST" in localhost|127.0.0.1|::1) ;; *) echo "Refusing to mutate non-local Postgres host: $DEKART_POSTGRES_HOST" >&2; exit 1;; esac; ' +
    'PGPASSWORD="$DEKART_POSTGRES_PASSWORD" psql ' +
      '-h "$DEKART_POSTGRES_HOST" ' +
      '-p "$DEKART_POSTGRES_PORT" ' +
      '-U "$DEKART_POSTGRES_USER" ' +
      '-d "$DEKART_POSTGRES_DB" ' +
      '-v ON_ERROR_STOP=1 ' +
      '-Atc "' + escaped + '"',
    options
  )
}

const sqlString = (value) => `'${value.replace(/'/g, "''")}'`

const waitForWorkspaceSourceSaved = (workspaceName, retries = 20) => {
  psql(`
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

    psql(`
      INSERT INTO workspace_log (workspace_id, email, status, authored_by, id, role)
      SELECT DISTINCT workspace_id, email, 2, email, gen_random_uuid(), role
      FROM workspace_log
      WHERE workspace_id <> '00000000-0000-0000-0000-000000000000'
    `)
    psql(`
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
