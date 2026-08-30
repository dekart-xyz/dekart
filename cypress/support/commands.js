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
    END $$;
  `)
})

Cypress.Commands.add('assertDatasetRows', (label, rows, timeout = 120000) => {
  const formattedRows = rows.toLocaleString('en-US')
  cy.contains('.source-data-title .dataset-name', label, { timeout }).should($name => {
    const section = $name.closest('.source-data-title').parent().parent()
    expect(section.find('.source-data-rows').text()).to.contain(`${formattedRows} rows`)
  })
})

Cypress.Commands.add('assertDatasetTable', (label, fields, values = []) => {
  cy.get('body').then($body => {
    if ($body.find('button[title="Save this map"]').length) {
      cy.get('button[title="Save this map"]').should('not.be.disabled')
      cy.wait(2000)
    }
  })
  cy.get('body').then($body => {
    if (!$body.find('.source-data-title .dataset-name:visible').length) {
      cy.get('.side-bar__close').click({ force: true })
    }
  })
  cy.contains('.source-data-title .dataset-name', label, { timeout: 120000 }).then($name => {
    const section = $name.closest('.source-data-title').parent().parent()
    const icon = section.find('.show-data-table svg')[0]
    expect(icon, `data table button for ${label}`).to.not.equal(undefined)
    icon.dispatchEvent(new icon.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  cy.get('#dataset-modal', { timeout: 30000 }).should('be.visible')
  fields.forEach(field => {
    cy.get(`#dataset-modal .header-cell[title="${field}"]`, { timeout: 120000 }).should('be.visible')
  })
  values.forEach(value => {
    cy.get(`#dataset-modal .cell[title="${value}"]`, { timeout: 120000 }).should('be.visible')
  })
  cy.get('.modal--close').click()
  cy.get('#dataset-modal').should('not.exist')
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
    cy.get('body').then($workspace => {
      if ($workspace.find('#source').length) {
        cy.get('#source').click()
        cy.get('.ant-select-item-option').contains('Google Search').click()
      }
    })
    cy.get('button:contains("Create")').click()
    // Wait for workspace selection to finish before the calling test navigates again.
    cy.get('button#dekart-create-report', { timeout: 30000 }).should('be.visible')
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
