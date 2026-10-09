/* eslint-disable no-undef */
const base = 'https://raw.githubusercontent.com/dekart-xyz/dekart/main/cypress/fixtures/'

// callMCP returns the external tool response, including expected preparation errors.
function callMCP (token, name, args = {}, agent) {
  return cy.request({
    method: 'POST',
    url: `${Cypress.env('DEKART_E2E_API_URL')}/api/v1/mcp/call`,
    headers: { Authorization: `Bearer ${token}`, ...(agent ? { 'User-Agent': agent } : {}) },
    body: { name, arguments: args },
    failOnStatusCode: false
  })
}

// sqlite runs fixed acceptance-test SQL against the local lane's database.
function sqlite (sql) {
  cy.writeFile('cypress/downloads/httpSourceDatasetUrl.sql', sql)
  return cy.exec('sqlite3 data/dekart.db < cypress/downloads/httpSourceDatasetUrl.sql')
}

// createQuery creates one DuckDB dataset and saves its SQL through MCP.
function createQuery (token, report, sql, label) {
  return callMCP(token, 'create_dataset', { report_id: report }).then(response => {
    expect(response.status).to.eq(200)
    const dataset = response.body.result.id
    if (label) callMCP(token, 'update_dataset_name', { dataset_id: dataset, name: label })
    return callMCP(token, 'create_query', {
      dataset_id: dataset,
      execution_engine: 'QUERY_EXECUTION_ENGINE_DUCKDB'
    })
  }).then(response => {
    const query = response.body.result.query_id
    return callMCP(token, 'update_query', { query_id: query, query_text: sql }).then(saved => {
      expect(saved.status).to.eq(200)
      expect(saved.body.result.dry_run.valid).to.eq(true)
      return query
    })
  })
}

// prepare returns the program as seen by an authenticated CLI.
function prepare (token, query, agent) {
  return callMCP(token, 'run_query', {
    query_id: query,
    accept_duckdb_execution: true,
    query_params_values: 'qp_station=A'
  }, agent).then(response => {
    expect(response.status).to.eq(200)
    return response.body.result.duckdb_execution
  })
}

describe('MCP HTTP source programs', () => {
  let token, report, constant, computed, dependent
  before(() => {
    cy.mcpDeviceToken('test@gmail.com', { deviceName: 'cypress-http-source' }).then(value => {
      token = value
      return callMCP(token, 'create_report')
    }).then(response => {
      report = response.body.result.report.id
      return sqlite(`UPDATE connections SET archived=true WHERE connection_type=8;
        UPDATE reports SET query_params=json_array(json_object('name','station','label','Station','type',1,'default_value','B')) WHERE id='${report}';`)
    })
    cy.visit('/connections')
    cy.get('#dekart-new-connection-connections, #dekart-new-connection-onboarding, #dekart-connection-type-card-http', { timeout: 30000 }).should('exist')
    cy.get('body').then($body => {
      if ($body.find('#dekart-new-connection-connections').length) cy.get('#dekart-new-connection-connections').click()
      else if ($body.find('#dekart-new-connection-onboarding').length) cy.get('#dekart-new-connection-onboarding').click()
    })
    cy.get('#dekart-connection-type-card-http').click()
    cy.get('#connectionName').clear().type('MCP URL fixture')
    cy.get('#httpBaseUrl').type(base)
    cy.get('#httpDocsUrl').type('https://example.com/docs')
    cy.contains('button', 'Add header').click()
    cy.get('#httpHeaderRows_0_name').type('X-Application-Id')
    cy.get('#httpHeaderRows_0_value').type('mcp-test-secret')
    cy.get('#saveConnection').click()
    cy.get('.ant-modal').should('not.exist')
    cy.then(() => {
      createQuery(token, report, "SELECT 'A' AS station", 'Input')
      createQuery(token, report, `SELECT * FROM read_csv('${base}sample.csv') LIMIT 1`, 'Constant').then(query => { constant = query })
      createQuery(token, report, `SELECT * FROM read_csv((SELECT format('${base}sample.csv?station={}', station || {{station}}) FROM datasets."Input")) LIMIT 1`, 'Computed').then(query => { computed = query })
      createQuery(token, report, `SELECT * FROM read_csv((SELECT format('${base}sample.csv?station={}', primary_type) FROM datasets."Computed")) LIMIT 1`, 'Dependent').then(query => { dependent = query })
    })
  })

  it('lists HTTP metadata and header names without values', () => {
    callMCP(token, 'list_connections').then(response => {
      expect(response.status).to.eq(200)
      const source = response.body.result.connections.find(c => c.connection_name === 'MCP URL fixture')
      expect(source.http_base_url).to.eq(base)
      expect(source.http_docs_url).to.eq('https://example.com/docs')
      expect(source.http_header_names).to.deep.eq(['X-Application-Id'])
      expect(JSON.stringify(response.body)).not.to.include('mcp-test-secret')
      expect(source).not.to.have.property('http_headers_json')
    })
  })

  it('returns the unknown-host compiler error verbatim', () => {
    createQuery(token, report, 'SELECT 1').then(query => callMCP(token, 'update_query', { query_id: query, query_text: "SELECT * FROM read_csv('https://unknown.example/sample.csv')" })).then(response => {
      expect(response.body.result.dry_run.valid || false).to.eq(false)
      expect(response.body.result.dry_run.message).to.eq('No HTTP source for unknown.example. Create one in Connections, or use a host from an existing HTTP source.')
    })
  })

  it('attaches a constant source to its statement only', () => {
    prepare(token, constant).then(program => {
      expect(program.sources || []).to.deep.eq([])
      const statement = program.statements.find(s => s.http_sources?.length)
      const source = statement.http_sources[0]
      expect(source.http_source_id).to.match(/^[a-f0-9-]{36}$/)
      expect(source.file_name).to.match(/^dekart_internal\/http_[a-f0-9]+\.csv$/)
      expect(source.extension).to.eq('csv')
      expect(source.url_sql || '').to.eq('')
      expect(statement.sql).to.include("getvariable('dekart_source_0_path')")
    })
  })

  it('places computed URL SQL after dependency views and parameters', () => {
    prepare(token, computed).then(program => {
      const index = program.statements.findIndex(s => s.http_sources?.length)
      expect(program.statements.slice(0, index).map(s => s.sql).join('\n')).to.include('CREATE OR REPLACE VIEW datasets.').and.include('CREATE OR REPLACE TABLE dekart_internal."params_')
      expect(program.statements[index - 1].parameters).to.deep.eq(['A'])
      expect(program.statements[index].http_sources[0].url_sql).to.include('datasets.').and.include('params_')
      expect(program.statements[index].sql).to.include("getvariable('dekart_source_0_path')")
    })
  })

  it('continues path numbering across computed query dependencies', () => {
    prepare(token, dependent).then(program => {
      const jobs = program.statements.filter(s => s.http_sources?.length)
      expect(jobs).to.have.length(2)
      expect(jobs[0].sql).to.include("getvariable('dekart_source_0_path')")
      expect(jobs[1].sql).to.include("getvariable('dekart_source_1_path')")
      expect(jobs[1].http_sources[0].url_sql).to.include('datasets.')
    })
  })

  it('attaches two constant readers to one statement', () => {
    createQuery(token, report, `SELECT * FROM read_csv('${base}sample.csv') UNION ALL SELECT * FROM read_csv('${base}sample.csv?station=A')`).then(query => prepare(token, query)).then(program => {
      const jobs = program.statements.filter(s => s.http_sources?.length)
      expect(jobs).to.have.length(1)
      expect(jobs[0].http_sources).to.have.length(2)
      expect(jobs[0].sql).to.include("getvariable('dekart_source_0_path')").and.include("getvariable('dekart_source_1_path')")
    })
  })

  it('downloads a computed source using the device token', () => {
    prepare(token, computed).then(program => {
      const source = program.statements.find(s => s.http_sources?.length).http_sources[0]
      cy.request({
        url: `${Cypress.env('DEKART_E2E_API_URL')}/api/v1/dataset-source/${source.dataset_id}/${source.http_source_id}.${source.extension}`,
        qs: { url: `${base}sample.csv?station=A` },
        headers: { Authorization: `Bearer ${token}` }
      }).its('status').should('eq', 200)
    })
  })

  it('rejects old CLI calls before creating any job', () => {
    sqlite('SELECT count(*) FROM query_jobs;').then(before => {
      callMCP(token, 'run_query', { query_id: constant, accept_duckdb_execution: true }, 'dekart-cli/0.21.0').then(response => {
        expect(response.status).to.eq(412)
        expect(response.body).to.eq('Update GeoSQL and the Dekart CLI: pip install --upgrade geosql dekart\n')
      })
      sqlite('SELECT count(*) FROM query_jobs;').its('stdout').should('eq', before.stdout)
      callMCP(token, 'list_connections', {}, 'dekart-cli/0.21.0').its('status').should('eq', 412)
    })
  })

  it('accepts the minimum CLI, missing agent, and other agents', () => {
    prepare(token, constant, 'dekart-cli/0.22.0')
    prepare(token, constant)
    prepare(token, constant, 'another-client/0.1.0')
  })
})
