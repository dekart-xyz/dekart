import { describe, expect, it } from 'vitest'
import { QueryExecutionEngine } from 'dekart-proto/dekart_pb'
import { buildDuckDBGraph } from './graph'

const duckQuery = id => ({ id, executionEngine: QueryExecutionEngine.QUERY_EXECUTION_ENGINE_DUCKDB })

describe('buildDuckDBGraph', () => {
  it('orders streamed jobs by their pinned DuckDB revisions', () => {
    const queries = [duckQuery('qa'), duckQuery('qb')]
    const datasets = [{ id: 'a', queryId: 'qa' }, { id: 'b', queryId: 'qb' }]
    const queryJobs = [
      { id: 'job-b', queryId: 'qb', queryParamsHash: 'params', queryText: 'select * from a', dependencyRevisionsList: [{ datasetId: 'a', queryJobId: 'job-a' }] },
      { id: 'job-a', queryId: 'qa', queryParamsHash: 'params', queryText: 'select 1', dependencyRevisionsList: [] }
    ]

    const graph = buildDuckDBGraph({ datasets, queries, queryJobs, queryParamsHash: 'params' })

    expect(graph.map(node => node.queryJob.id)).toEqual(['job-a', 'job-b'])
    expect(graph.map(node => node.queryJob.queryText)).toEqual(['select 1', 'select * from a'])
    expect(graph.every(node => node.publish)).toBe(true)
  })

  it('includes a historical pinned job without publishing it', () => {
    const queries = [duckQuery('qa'), duckQuery('qb')]
    const datasets = [{ id: 'a', queryId: 'qa' }, { id: 'b', queryId: 'qb' }]
    const queryJobs = [
      { id: 'job-a-current', queryId: 'qa', queryParamsHash: 'params', queryText: 'select 2', dependencyRevisionsList: [] },
      { id: 'job-b', queryId: 'qb', queryParamsHash: 'params', queryText: 'select * from a', dependencyRevisionsList: [{ datasetId: 'a', queryJobId: 'job-a-old' }] },
      { id: 'job-a-old', queryId: 'qa', queryParamsHash: 'params', queryText: 'select 1', dependencyRevisionsList: [] }
    ]

    const graph = buildDuckDBGraph({ datasets, queries, queryJobs, queryParamsHash: 'params' })

    expect(graph.map(node => [node.queryJob.id, node.publish])).toEqual([
      ['job-a-current', true],
      ['job-a-old', false],
      ['job-b', true]
    ])
  })

  it('does not invent a node without a server-created job', () => {
    expect(buildDuckDBGraph({
      datasets: [{ id: 'a', queryId: 'qa' }],
      queries: [duckQuery('qa')],
      queryJobs: [],
      queryParamsHash: 'params'
    })).toEqual([])
  })
})
