/* eslint-disable no-undef */
import copy from '../../fixtures/copy.json'

const appUrl = Cypress.env('DEKART_E2E_BASE_URL') || 'http://localhost:3000'
const ciValue = String(Cypress.env('CI') ?? '').toLowerCase()
const isCI = ciValue === 'true' || ciValue === '1' || String(Cypress.env('CYPRESS_CI') ?? '') === '1'
const apiBase = isCI ? `${appUrl}/api/v1` : 'http://localhost:8080/api/v1'

const sqlString = (value) => `'${value.replace(/'/g, "''")}'`

const psql = (sql) => {
  const escaped = sql.replace(/"/g, '\\"')
  return cy.exec(
    'case "$DEKART_POSTGRES_HOST" in localhost|127.0.0.1|::1) ;; *) echo "Refusing to mutate non-local Postgres host: $DEKART_POSTGRES_HOST" >&2; exit 1;; esac; ' +
    'PGPASSWORD="$DEKART_POSTGRES_PASSWORD" psql ' +
      '-h "$DEKART_POSTGRES_HOST" ' +
      '-p "$DEKART_POSTGRES_PORT" ' +
      '-U "$DEKART_POSTGRES_USER" ' +
      '-d "$DEKART_POSTGRES_DB" ' +
      '-v ON_ERROR_STOP=1 ' +
      '-Atc "' + escaped + '"'
  )
}

const callMCP = (name, args = {}) => {
  return cy.request({
    method: 'POST',
    url: `${apiBase}/mcp/call`,
    body: {
      name,
      arguments: args
    },
    failOnStatusCode: false
  }).then((response) => {
    expect(response.status, `${name} http status`).to.eq(200)
    expect(response.body).to.have.property('result')
    return response.body.result
  })
}

const readId = (obj, candidates) => {
  for (const key of candidates) {
    const value = obj?.[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}

const normalizeJobStatus = (value) => {
  if (typeof value === 'number') return value
  if (value === 'JOB_STATUS_DONE' || value === 'DONE') return 5
  if (value === 'JOB_STATUS_UNSPECIFIED' || value === 'UNSPECIFIED') return 0
  if (value === 'JOB_STATUS_PENDING' || value === 'PENDING') return 1
  if (value === 'JOB_STATUS_RUNNING' || value === 'RUNNING') return 2
  if (value === 'JOB_STATUS_DONE_LEGACY' || value === 'DONE_LEGACY') return 3
  if (value === 'JOB_STATUS_READING_RESULTS' || value === 'READING_RESULTS') return 4
  return Number.isNaN(Number(value)) ? -1 : Number(value)
}

const pollJobDone = (jobId, retries = 30) => {
  return callMCP('check_job_status', { job_id: jobId }).then((result) => {
    const job = result.query_job || result.queryJob || result
    const status = normalizeJobStatus(job.job_status ?? job.jobStatus)
    if (status === 5) return job
    if (status === 0) {
      throw new Error(`query job failed: ${job.job_error || job.jobError || 'unknown'}`)
    }
    if (retries <= 0) {
      throw new Error(`query job timeout; last status=${status}`)
    }
    cy.wait(1000)
    return pollJobDone(jobId, retries - 1)
  })
}

const createRunnableReport = () => {
  return callMCP('create_report').then((reportResult) => {
    const reportId = readId(reportResult, ['report_id', 'reportId', 'id']) ||
      readId(reportResult?.report, ['id'])
    expect(reportId, 'report_id').to.be.a('string')
    expect(reportId, 'report_id').not.to.eq('')

    return callMCP('create_dataset', { report_id: reportId }).then((dataset) => {
      const datasetId = readId(dataset, ['dataset_id', 'datasetId', 'id'])
      expect(datasetId, 'dataset_id').to.be.a('string')
      expect(datasetId, 'dataset_id').not.to.eq('')

      return callMCP('create_query', {
        dataset_id: datasetId,
        connection_id: ''
      }).then((query) => {
        const queryId = readId(query, ['query_id', 'queryId']) || readId(query?.query, ['id'])
        expect(queryId, 'query_id').to.be.a('string')
        expect(queryId, 'query_id').not.to.eq('')

        return callMCP('update_query', {
          query_id: queryId,
          query_text: copy.simple_pg_query
        }).then(() => {
          return callMCP('run_query', { query_id: queryId }).then((runResult) => {
            const jobId = runResult.query_job?.id || runResult.queryJob?.id
            expect(jobId, 'job_id').to.be.a('string')
            expect(jobId, 'job_id').not.to.eq('')

            return pollJobDone(jobId).then(() => reportId)
          })
        })
      })
    })
  })
}

const createLegacyMissingSourceQuery = (reportId) => {
  return callMCP('create_dataset', { report_id: reportId }).then((dataset) => {
    const datasetId = readId(dataset, ['dataset_id', 'datasetId', 'id'])
    expect(datasetId, 'dataset_id').to.be.a('string')
    expect(datasetId, 'dataset_id').not.to.eq('')

    return callMCP('create_query', {
      dataset_id: datasetId,
      connection_id: ''
    }).then((query) => {
      const queryId = readId(query, ['query_id', 'queryId']) || readId(query?.query, ['id'])
      expect(queryId, 'query_id').to.be.a('string')
      expect(queryId, 'query_id').not.to.eq('')

      return psql(`
        UPDATE queries
        -- query_source=2 is QUERY_SOURCE_STORAGE.
        SET query_text = '', query_source = 2, query_source_id = ${sqlString(`missing-source-${Date.now()}`)}
        WHERE id = ${sqlString(queryId)}
      `).then(() => queryId)
    })
  })
}

describe('pg-s3 run all queries legacy missing source regression', () => {
  it('refreshes runnable queries when another legacy query source is missing', () => {
    cy.intercept('POST', '**/Dekart/RunAllQueries').as('runAllQueries')

    createRunnableReport().then((reportId) => {
      cy.visit(`${appUrl}/reports/${reportId}/source`)
      cy.get('button#dekart-refresh-button', { timeout: 30000 }).should('be.visible')
      return createLegacyMissingSourceQuery(reportId)
    })

    cy.get('button#dekart-refresh-button', { timeout: 30000 }).click()
    cy.get('#dekart-refresh-now-button').click()
    cy.wait('@runAllQueries', { timeout: 120000 }).its('response.statusCode').should('eq', 200)
    cy.contains('[role="tab"]', 'Query 1', { timeout: 30000 }).click()
    cy.get(`span:contains("${copy.ready}")`, { timeout: 120000 }).should('be.visible')
  })
})
