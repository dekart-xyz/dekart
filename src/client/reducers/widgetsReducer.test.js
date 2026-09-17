/* global describe, expect, it */

import widgets from './widgetsReducer'

const reportUpdate = (versionId, widgetsConfig) => ({
  type: 'reportUpdate',
  report: { versionId, widgetsConfig }
})

describe('widgets report version reconciliation', () => {
  it('advances past an unrelated report write while preserving a local widget draft', () => {
    const savedRaw = JSON.stringify({ version: 1, widgets: [] })
    const draft = { version: 1, widgets: [{ id: 'row-count' }] }
    const saved = widgets(undefined, reportUpdate('v1', savedRaw))
    const dirty = widgets(saved, { type: 'widgetsChanged', config: draft })

    expect(widgets(dirty, reportUpdate('v2', savedRaw))).toEqual({
      ...dirty,
      savedRaw,
      versionId: 'v2',
      conflict: false
    })
  })

  it('still flags a real remote widget change while a local draft is dirty', () => {
    const savedRaw = JSON.stringify({ version: 1, widgets: [] })
    const remoteRaw = JSON.stringify({ version: 1, widgets: [{ id: 'remote' }] })
    const saved = widgets(undefined, reportUpdate('v1', savedRaw))
    const dirty = widgets(saved, { type: 'widgetsChanged', config: { version: 1, widgets: [{ id: 'local' }] } })

    expect(widgets(dirty, reportUpdate('v2', remoteRaw))).toEqual({
      ...dirty,
      conflict: true
    })
  })
})
