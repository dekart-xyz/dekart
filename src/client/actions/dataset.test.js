import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { processDownloadError } from './dataset'
import { grpcCall } from './grpc'
import { failDuckDBSource } from './duckdb'
import { info, setError } from './message'

vi.mock('./grpc', () => ({ grpcCall: vi.fn(() => ({ type: 'grpcCall' })) }))
vi.mock('./duckdb', () => ({
  failDuckDBSource: vi.fn(() => ({ type: 'failDuckDBSource' })),
  registerDuckDBFileSource: vi.fn(),
  registerDuckDBSource: vi.fn(),
  removeDuckDBSource: vi.fn()
}))
vi.mock('./message', () => ({
  info: vi.fn(() => ({ type: 'info' })),
  setError: vi.fn(() => ({ type: 'setError' })),
  warn: vi.fn(),
  success: vi.fn()
}))

describe('missing query result recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
  })
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    ['runnable query', 410, 'query-1', true, false, true],
    ['execution pending', 410, 'query-1', true, true, false],
    ['query cannot run', 410, 'query-1', false, false, false],
    ['missing uploaded file', 404, '', false, false, false]
  ])('%s', async (_, status, queryId, canRun, pending, expectRun) => {
    const controller = new AbortController()
    const dataset = { id: 'dataset-1', queryId }
    const state = {
      dataset: { downloading: [{ dataset, controller }] },
      queryStatus: { 'query-1': { canRun, queryText: 'select {{value}}' } },
      queryExecutionsPending: { 'query-1': pending },
      queryJobs: [],
      queryParams: { hash: 'current-params', list: [], url: '?value=42' }
    }
    const actions = []
    const dispatch = action => {
      if (typeof action === 'function') return action(dispatch, () => state)
      actions.push(action)
      return action
    }
    const error = { status, message: 'Dataset source missing' }

    await processDownloadError(error, dataset, 'Query 1', false, controller)(dispatch, () => state)

    expect(grpcCall).toHaveBeenCalledTimes(expectRun ? 1 : 0)
    expect(info).toHaveBeenCalledTimes(expectRun ? 1 : 0)
    if (expectRun) {
      const request = grpcCall.mock.calls[0][1]
      expect(request.getQueryId()).toBe('query-1')
      expect(request.getQueryText()).toBe('select {{value}}')
      expect(request.getQueryParamsValues()).toBe('?value=42')
      expect(actions.some(action => action.type === 'queryExecutionStarted')).toBe(true)
    }
    if (status === 404) {
      expect(failDuckDBSource).toHaveBeenCalledOnce()
      expect(setError).toHaveBeenCalledWith(error)
    }
  })
})
