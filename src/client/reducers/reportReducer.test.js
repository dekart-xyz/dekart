import { describe, expect, it } from 'vitest'
import { reportStatus } from './reportReducer'

describe('report save conflicts', () => {
  it('latches a remote map conflict until the report is reopened', () => {
    const conflicted = reportStatus(undefined, {
      type: 'reportUpdate',
      report: { autoRefreshIntervalSeconds: 0 },
      hasRemoteMapConflict: true
    })

    expect(conflicted.mapConfigConflict).toBe(true)
    expect(reportStatus(conflicted, {
      type: 'reportUpdate',
      report: { autoRefreshIntervalSeconds: 0 },
      hasRemoteMapConflict: false
    }).mapConfigConflict).toBe(true)
    expect(reportStatus(conflicted, { type: 'openReport' }).mapConfigConflict).toBe(false)
  })
})
