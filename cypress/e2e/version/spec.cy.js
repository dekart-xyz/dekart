/* eslint-disable no-undef */

// readInstanceId verifies the persistent bootstrap row through the active local metadata backend.
function readInstanceId () {
  return cy.exec(
    'if [ -n "$DEKART_SQLITE_DB_PATH" ]; then ' +
      'sqlite3 "$DEKART_SQLITE_DB_PATH" "SELECT id FROM instance_keys WHERE key_name = \'bootstrap_root\'"; ' +
      'else ' +
      'case "$DEKART_POSTGRES_HOST" in localhost|127.0.0.1|::1) ;; *) echo "Refusing non-local Postgres host: $DEKART_POSTGRES_HOST" >&2; exit 1;; esac; ' +
      'PGPASSWORD="$DEKART_POSTGRES_PASSWORD" psql ' +
        '-h "$DEKART_POSTGRES_HOST" ' +
        '-p "$DEKART_POSTGRES_PORT" ' +
        '-U "$DEKART_POSTGRES_USER" ' +
        '-d "$DEKART_POSTGRES_DB" ' +
        '-v ON_ERROR_STOP=1 ' +
        '-Atc "SELECT id FROM instance_keys WHERE key_name = \'bootstrap_root\'"; ' +
      'fi'
  )
}

describe('Version banner', () => {
  it('shows new release banner when forced old version is configured', () => {
    let persistedInstanceId
    readInstanceId().its('stdout').then((stdout) => {
      persistedInstanceId = stdout.trim()
      expect(persistedInstanceId).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    })

    cy.intercept('GET', '**/api/v1/version*', (req) => {
      expect(req.query.instance_id).to.equal('00000000-0000-4000-8000-000000000001')
      req.reply({
        tag_name: 'v999.0.0',
        html_url: 'https://github.com/dekart-xyz/dekart/releases/tag/v999.0.0'
      })
    }).as('versionCheck')

    cy.visit('/')
    cy.wait('@versionCheck')
    cy.contains('New release v999.0.0 available').should('be.visible')

    cy.reload()
    cy.wait('@versionCheck')
    readInstanceId().its('stdout').then((stdout) => {
      expect(stdout.trim()).to.equal(persistedInstanceId)
    })
  })
})
