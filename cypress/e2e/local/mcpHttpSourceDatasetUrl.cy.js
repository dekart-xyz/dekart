/* eslint-disable no-undef */
const base = 'https://raw.githubusercontent.com/dekart-xyz/dekart/main/cypress/fixtures/'

// callMCP returns the external tool response, including expected preparation errors.
function callMCP (token, name, args = {}) {
  return cy.request({ method: 'POST', url: `${Cypress.env('DEKART_E2E_API_URL')}/api/v1/mcp/call`,
    headers: { Authorization: `Bearer ${token}` }, body: { name, arguments: args }, failOnStatusCode: false })
}

// sqlite runs fixed acceptance-test SQL against the local lane's database.
function sqlite (sql) {
  cy.writeFile('cypress/downloads/httpSourceDatasetUrl.sql', sql)
  return cy.exec('sqlite3 data/dekart.db < cypress/downloads/httpSourceDatasetUrl.sql')
}

// createQuery creates one DuckDB dataset and saves its SQL through MCP.
function createQuery (token, report, sql) {
  return callMCP(token, 'create_dataset', { report_id: report }).then(response => {
    expect(response.status).to.eq(200)
    return callMCP(token, 'create_query', { dataset_id: response.body.result.id,
      execution_engine: 'QUERY_EXECUTION_ENGINE_DUCKDB' })
  }).then(response => {
    const query = response.body.result.query_id
    return callMCP(token, 'update_query', { query_id: query, query_text: sql }).then(saved => {
      expect(saved.status).to.eq(200)
      expect(saved.body.result.dry_run.valid).to.eq(true)
      return query
    })
  })
}

describe('MCP dataset-derived HTTP URL preparation', () => {
  let token, report, computed
  before(() => {
    cy.mcpDeviceToken('test@gmail.com', { deviceName: 'cypress-http-dataset-url' }).then(value => {
      token = value
      return callMCP(token, 'create_report')
    }).then(response => {
      report = response.body.result.report.id
      return sqlite(`UPDATE connections SET archived=true WHERE connection_name='MCP URL fixture';
        INSERT INTO connections (id,connection_name,workspace_id,connection_type,http_base_url)
        SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-4'||substr(lower(hex(randomblob(2))),2)||'-a'||substr(lower(hex(randomblob(2))),2)||'-'||lower(hex(randomblob(6))),'MCP URL fixture',workspace_id,8,'${base}' FROM reports WHERE id='${report}';`)
    }).then(() => createQuery(token, report, `SELECT * FROM read_csv((SELECT format('${base}sample.csv?station={}', 'A'))) LIMIT 1`))
      .then(query => { computed = query })
  })

  it('saves computed syntax and rejects preparation without creating a job', () => {
    sqlite(`SELECT count(*) FROM query_jobs WHERE query_id='${computed}';`).then(before => {
      callMCP(token, 'run_query', { query_id: computed, accept_duckdb_execution: true }).then(response => {
        expect(JSON.stringify(response.body)).to.include('Dataset-derived HTTP URLs currently require browser execution.')
      })
      sqlite(`SELECT count(*) FROM query_jobs WHERE query_id='${computed}';`).its('stdout').should('eq', before.stdout)
    })
  })

  it('rejects a dependent query before creating jobs', () => {
    sqlite(`INSERT INTO connections (id,connection_name,workspace_id,connection_type)
      SELECT '${crypto.randomUUID()}','Unlaunched warehouse',workspace_id,5 FROM reports WHERE id='${report}';
      INSERT INTO queries (id,query_text,execution_engine) VALUES ('${crypto.randomUUID()}','SELECT 1 AS value',1);
      INSERT INTO datasets (id,report_id,name,connection_id,query_id)
      SELECT '${crypto.randomUUID()}','${report}','Warehouse',
      (SELECT id FROM connections WHERE connection_name='Unlaunched warehouse' ORDER BY created_at DESC LIMIT 1),
      (SELECT id FROM queries WHERE query_text='SELECT 1 AS value' ORDER BY created_at DESC LIMIT 1);`)
    createQuery(token, report, 'SELECT * FROM datasets."Query 1" CROSS JOIN datasets."Warehouse"').then(query => {
      sqlite('SELECT count(*) FROM query_jobs;').then(before => {
        callMCP(token, 'run_query', { query_id: query, accept_duckdb_execution: true }).then(response => {
          expect(JSON.stringify(response.body)).to.include('Dataset-derived HTTP URLs currently require browser execution.')
        })
        sqlite('SELECT count(*) FROM query_jobs;').its('stdout').should('eq', before.stdout)
      })
    })
  })

  it('returns the download source and bound file path for a constant URL program', () => {
    createQuery(token, report, `SELECT * FROM read_csv('${base}sample.csv') LIMIT 1`).then(query => {
      callMCP(token, 'run_query', { query_id: query, accept_duckdb_execution: true }).then(response => {
        expect(response.status).to.eq(200)
        const program = response.body.result.duckdb_execution
        expect(program.sources).to.have.length(1)
        expect(program.sources[0].http_source_id).to.match(/^[a-f0-9-]{36}$/)
        expect(program.sources[0].file_name).to.include('dekart_internal/http_')
        expect(program.statements.map(statement => statement.sql).join('\n')).to.include("getvariable('dekart_source_0_path')")
      })
    })
  })
})
