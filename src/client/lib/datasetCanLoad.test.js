import { describe, expect, it } from 'vitest'
import { File } from 'dekart-proto/dekart_pb'
import { DuckDBJobStatus } from './duckdb/constants'
import { datasetCanLoad } from './datasetCanLoad'

describe('datasetCanLoad', () => {
  it('loads only a stored file that has a source', () => {
    const dataset = { fileId: 'f1' }
    expect(datasetCanLoad(dataset, [{ id: 'f1', fileStatus: File.Status.STATUS_STORED, sourceId: 's1' }], [], {}, 'h')).toBe(true)
    expect(datasetCanLoad(dataset, [{ id: 'f1', fileStatus: File.Status.STATUS_STORED, sourceId: '' }], [], {}, 'h')).toBe(false)
    expect(datasetCanLoad(dataset, [{ id: 'f1', fileStatus: File.Status.STATUS_NEW, sourceId: 's1' }], [], {}, 'h')).toBe(false)
  })

  it('loads a query only through a job for the current parameters that has not failed', () => {
    const dataset = { queryId: 'q1' }
    expect(datasetCanLoad(dataset, [], [{ id: 'j1', queryId: 'q1', queryParamsHash: 'h' }], {}, 'h')).toBe(true)
    expect(datasetCanLoad(dataset, [], [{ id: 'j1', queryId: 'q1', queryParamsHash: 'other' }], {}, 'h')).toBe(false)
    expect(datasetCanLoad(dataset, [], [{ id: 'j1', queryId: 'q1', queryParamsHash: 'h', jobError: 'boom' }], {}, 'h')).toBe(false)
    expect(datasetCanLoad(dataset, [], [{ id: 'j1', queryId: 'q1', queryParamsHash: 'h' }], { j1: { status: DuckDBJobStatus.DUCKDB_JOB_STATUS_ERROR } }, 'h')).toBe(false)
    expect(datasetCanLoad({}, [], [], {}, 'h')).toBe(false)
  })
})
