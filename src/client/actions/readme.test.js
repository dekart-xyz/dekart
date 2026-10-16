import { afterEach, describe, expect, it, vi } from 'vitest'
import { removeReadme } from './readme'
import { saveMap, waitForReportSave } from './report'

vi.mock('./report', () => ({
  saveMap: vi.fn(() => ({ type: 'saveMap' })),
  waitForReportSave: vi.fn()
}))

afterEach(() => vi.clearAllMocks())

describe('removeReadme', () => {
  it.each(['report-b', null])('does not delete a README after leaving the report for %s', async nextReportId => {
    let finishSave
    waitForReportSave.mockReturnValue(new Promise(resolve => { finishSave = resolve }))
    let report = { id: 'report-a' }
    const dispatch = vi.fn()

    const removal = removeReadme()(dispatch, () => ({ report }))
    expect(dispatch).not.toHaveBeenCalled()
    report = nextReportId ? { id: nextReportId } : null
    finishSave()
    await removal

    expect(dispatch).not.toHaveBeenCalled()
    expect(saveMap).not.toHaveBeenCalled()
  })
})
