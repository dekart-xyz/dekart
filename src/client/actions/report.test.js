import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportTitleChange, reportUpdate, scheduleQueryJobRefresh } from './report'
import { report as reportReducer, reportStatus } from '../reducers/reportReducer'

describe('report titles during stream updates', () => {
  it('keeps an unsaved title when a query update carries the previously saved title', async () => {
    let state = {
      report: { id: 'report-a', versionId: 'version-a', title: 'Untitled', mapConfig: '' },
      reportStatus: { ...reportStatus(undefined, {}), edit: true, title: 'Untitled' },
      dataset: { list: [] },
      queries: [],
      files: [],
      queryJobs: [],
      queryStatus: {},
      queryParams: { list: [], values: {}, url: '', hash: '' },
      env: { variables: {} },
      connection: {},
      user: {}
    }
    const dispatch = action => {
      if (typeof action === 'function') return action(dispatch, () => state)
      state = {
        ...state,
        report: reportReducer(state.report, action),
        reportStatus: reportStatus(state.reportStatus, action)
      }
    }
    dispatch(reportTitleChange('Navigation map B'))
    await dispatch(reportUpdate({
      report: { ...state.report, versionId: 'version-b', queryParamsList: [] },
      queriesList: [],
      datasetsList: [],
      filesList: [],
      queryJobsList: [],
      directAccessEmailsList: []
    }))
    expect(state.reportStatus.title).toBe('Navigation map B')
    expect(state.reportStatus.lastChanged).toBeGreaterThan(state.reportStatus.lastSaved)
  })
})

describe('scheduleQueryJobRefresh', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not schedule warehouse refreshes in snapshot mode', () => {
    vi.useFakeTimers()
    const dispatch = vi.fn()
    const getState = () => ({ reportStatus: { snapshotMode: true } })

    scheduleQueryJobRefresh({ report: { autoRefreshIntervalSeconds: 1 } })(dispatch, getState)

    expect(dispatch).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
