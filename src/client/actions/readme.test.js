import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dekart } from 'dekart-proto/dekart_pb_service'
import { closeReport, removeReadme, reportUpdate, saveMap } from './report'
import { grpcCall } from './grpc'
import readmeReducer from '../reducers/readmeReducer'
import { report as reportReducer, reportStatus } from '../reducers/reportReducer'

vi.mock('./grpc', () => ({
  grpcCall: vi.fn(() => ({ type: 'rpc' })),
  grpcStreamCancel: vi.fn(() => ({ type: 'cancelStream' }))
}))
vi.mock('../lib/mapConfig', () => ({ getMapConfigToSave: () => ({}) }))

afterEach(() => vi.clearAllMocks())

// Keep the real report and README reducers so assertions cover the state seen by saving and rendering.
function createReportStore () {
  let state = {
    report: { id: 'report-a', versionId: 'version-a', mapConfig: '', readme: { markdown: 'Saved notes' } },
    readme: { markdown: 'Saved notes', showTab: true, showPreview: true },
    reportStatus: { ...reportStatus(undefined, {}), lastChanged: 20, lastSaved: 10 },
    keplerGl: { kepler: { visState: { datasets: {} } } },
    dataset: { list: [], autoCreateLayerIds: [] },
    queries: [],
    files: [],
    queryJobs: [],
    queryStatus: {},
    queryParams: { list: [], values: {}, url: '', hash: '' },
    env: { variables: {} },
    connection: {},
    user: {},
    widgets: { raw: '', revision: 0 }
  }
  const getState = () => state
  const dispatch = action => {
    if (typeof action === 'function') return action(dispatch, getState)
    state = {
      ...state,
      report: reportReducer(state.report, action),
      readme: readmeReducer(state.readme, action),
      reportStatus: reportStatus(state.reportStatus, action)
    }
    return action
  }
  return { dispatch, getState }
}

// A streamed report, rather than a command acknowledgement, supplies canonical README content.
function streamReport (versionId, readme) {
  return reportUpdate({
    report: { id: 'report-a', versionId, readme, mapConfig: '', queryParamsList: [] },
    queriesList: [],
    datasetsList: [],
    filesList: [],
    queryJobsList: [],
    directAccessEmailsList: []
  })
}

describe('removeReadme', () => {
  it('uses only the removal command and blocks saves until canonical removal arrives', async () => {
    const store = createReportStore()
    const removal = store.dispatch(removeReadme())
    await Promise.resolve()
    const [method, request, accept] = grpcCall.mock.calls[0]
    expect(method).toBe(Dekart.RemoveReadme)
    expect(request.getExpectedVersionId()).toBe('version-a')
    expect(store.getState().readme.markdown).toBe('Saved notes')

    const oldStream = store.dispatch(streamReport('version-a', { markdown: 'Saved notes' }))
    accept({ versionId: 'version-b' })
    await oldStream
    expect(await store.dispatch(saveMap())).toBe(false)
    expect(grpcCall).toHaveBeenCalledTimes(1)
    await store.dispatch(streamReport('version-b', null))
    expect(await removal).toBe(true)
    expect(store.getState().readme.markdown).toBeNull()
    expect(store.getState().readme.showTab).toBe(false)
    expect(store.getState().reportStatus.saving).toBe(false)
    expect(store.getState().reportStatus.lastSaved).toBe(10)
  })

  it('preserves the README after rejection', async () => {
    const store = createReportStore()
    const removal = store.dispatch(removeReadme())
    await Promise.resolve()
    grpcCall.mock.calls[0][3]({ code: 10, message: 'Report changed' })
    expect(await removal).toBe(false)
    expect(store.getState().readme.markdown).toBe('Saved notes')
    expect(store.getState().readme.showTab).toBe(true)
    expect(store.getState().reportStatus.saving).toBe(false)
  })

  it('releases a queued removal after the first command is rejected', async () => {
    const store = createReportStore()
    const first = store.dispatch(removeReadme())
    const second = store.dispatch(removeReadme())
    grpcCall.mock.calls[0][3]({ code: 10, message: 'Report changed' })
    expect(await first).toBe(false)
    await Promise.resolve()
    expect(grpcCall).toHaveBeenCalledTimes(2)
    grpcCall.mock.calls[1][2]({ versionId: 'version-b' })
    await Promise.resolve()
    await store.dispatch(streamReport('version-b', null))
    expect(await second).toBe(true)
  })

  it('does not let a rejected command unblock a later removal through its queued stream', async () => {
    const store = createReportStore()
    const first = store.dispatch(removeReadme())
    const queuedStream = store.dispatch(streamReport('version-remote', { markdown: 'Remote notes' }))
    const second = store.dispatch(removeReadme())
    grpcCall.mock.calls[0][3]({ code: 10, message: 'Report changed' })
    expect(await first).toBe(false)
    await queuedStream
    try {
      expect(store.getState().reportStatus.saving).toBe(true)
    } finally {
      store.dispatch(closeReport())
      grpcCall.mock.calls[1][3]({ code: 10, message: 'Report changed' })
      await second
    }
  })

  it('releases removal when the report closes before its canonical update', async () => {
    const store = createReportStore()
    const removal = store.dispatch(removeReadme())
    grpcCall.mock.calls[0][2]({ versionId: 'version-b' })
    await Promise.resolve()
    store.dispatch(closeReport())
    expect(await removal).toBe(false)
  })

  it('does not submit removal after navigating away during a save', async () => {
    const store = createReportStore()
    const save = store.dispatch(saveMap())
    const removal = store.dispatch(removeReadme())
    store.dispatch(closeReport())
    grpcCall.mock.calls[0][2]({ versionId: 'version-b' })
    await save
    expect(await removal).toBe(false)
    expect(grpcCall).toHaveBeenCalledTimes(1)
  })
})
