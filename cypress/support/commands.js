// custom cypress commands
// see https://on.cypress.io/custom-commands
/* eslint-disable no-undef */

let googleOAuthInterceptInstalled = false
let googleOAuthRedirectState = ''
let googleOAuthReturnUrl = ''

Cypress.on('test:before:run', () => {
  googleOAuthInterceptInstalled = false
  googleOAuthRedirectState = ''
  googleOAuthReturnUrl = ''
})

Cypress.Commands.add('setDevClaimsEmail', (email) => {
  cy.setCookie('dekart-dev-claim-email', email)
})

Cypress.Commands.add('psql', (sql, options = {}) => {
  const escaped = sql
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
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
})

Cypress.Commands.add('resetCloudTestDatabase', () => {
  cy.psql(`
    DO $$
    DECLARE stmt text;
    BEGIN
      IF current_database() <> 'dekart' THEN
        RAISE EXCEPTION 'Refusing to reset unexpected database %', current_database();
      END IF;

      SELECT string_agg(format('TRUNCATE TABLE %I.%I CASCADE', schemaname, tablename), '; ')
      INTO stmt
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT IN ('schema_migrations', 'instance_keys');

      IF stmt IS NOT NULL THEN
        EXECUTE stmt;
      END IF;
    END $$
  `)
})

Cypress.Commands.add('ensureTestWorkspace', () => {
  cy.get('body', { timeout: 30000 }).should(($body) => {
    const workspaceReady = $body.find('button#dekart-create-report').length > 0 ||
      $body.find('button#dekart-create-workspace').length > 0 ||
      $body.text().includes('Create Workspace')
    expect(workspaceReady).to.equal(true)
  }).then(($body) => {
    if ($body.find('button#dekart-create-report').length > 0) {
      return
    }
    if ($body.find('button#dekart-create-workspace').length > 0) {
      cy.get('button#dekart-create-workspace').click()
    } else {
      cy.contains('button', 'Create Workspace').click()
    }
    cy.get('input#name').type('test')
    cy.get('#source').click()
    cy.get('.ant-select-item-option').contains('Google Search').click()
    cy.get('button:contains("Create")').click()
  })
})

Cypress.Commands.add('stubGoogleOAuthToken', (refreshTokenEnvName = 'DEV_REFRESH_TOKEN', returnPath = '/') => {
  cy.task('googleOAuthRedirectState', { refreshTokenEnvName }).then((redirectState) => {
    googleOAuthRedirectState = redirectState
    googleOAuthReturnUrl = new URL(returnPath, Cypress.config('baseUrl')).toString()
    if (googleOAuthInterceptInstalled) {
      return
    }
    googleOAuthInterceptInstalled = true
    cy.intercept('GET', '**/api/v1/authenticate*', (req) => {
      const url = new URL(googleOAuthReturnUrl)
      url.searchParams.set('redirect_state', googleOAuthRedirectState)
      req.redirect(url.toString())
    }).as('authenticate')
  })
})
