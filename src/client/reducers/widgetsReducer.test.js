/* global describe, expect, it */

import widgets from './widgetsReducer'

const reportUpdate = (versionId, widgetsConfig) => ({
  type: 'reportUpdate',
  report: { versionId, widgetsConfig }
})

const widgetsConfig = (dashboardId) => ({
  version: 1,
  provider: 'sqlrooms',
  config: {
    dashboardsById: dashboardId
      ? { [dashboardId]: { id: dashboardId, title: 'Widgets', panelOrder: [], panels: [] } }
      : {}
  }
})

describe('widgets report version reconciliation', () => {
  it('advances past an unrelated report write while preserving a local widget draft', () => {
    const savedRaw = JSON.stringify(widgetsConfig())
    const draft = widgetsConfig('local')
    const saved = widgets(undefined, reportUpdate('v1', savedRaw))
    const dirty = widgets(saved, { type: 'widgetsChanged', config: draft })

    expect(widgets(dirty, reportUpdate('v2', savedRaw))).toEqual({
      ...dirty,
      savedRaw,
      versionId: 'v2',
      conflict: false
    })
  })

  it('accepts the same widget config with canonical server key ordering', () => {
    const savedRaw = JSON.stringify(widgetsConfig())
    const draft = widgetsConfig('local')
    const dirty = widgets(widgets(undefined, reportUpdate('v1', savedRaw)), { type: 'widgetsChanged', config: draft })
    const reordered = JSON.stringify({ config: draft.config, provider: draft.provider, version: draft.version })

    expect(widgets(dirty, reportUpdate('v2', reordered))).toEqual({
      ...dirty,
      savedRaw: reordered,
      versionId: 'v2',
      conflict: false
    })
  })

  it('still flags a real remote widget change while a local draft is dirty', () => {
    const savedRaw = JSON.stringify(widgetsConfig())
    const remoteRaw = JSON.stringify(widgetsConfig('remote'))
    const saved = widgets(undefined, reportUpdate('v1', savedRaw))
    const dirty = widgets(saved, { type: 'widgetsChanged', config: widgetsConfig('local') })

    expect(widgets(dirty, reportUpdate('v2', remoteRaw))).toEqual({
      ...dirty,
      conflict: true
    })
  })
})
