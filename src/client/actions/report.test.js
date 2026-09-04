import { afterEach, describe, expect, it, vi } from 'vitest'
import { scheduleQueryJobRefresh } from './report'

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
