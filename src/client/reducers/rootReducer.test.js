import { describe, expect, it, vi } from 'vitest'
import { loadFiles, loadFilesErr } from '@kepler.gl/actions'
import reducer from './rootReducer'

describe('rootReducer kepler file loading', () => {
  it('lets Kepler settle load file errors without adding its global notification', () => {
    const file = new File(['not,a,valid,shape'], 'bad.csv', { type: 'text/csv' })
    const error = new Error('Cannot parse CSV')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    let state = reducer(undefined, { type: '@@INIT' })
    state = reducer(state, { type: '@@kepler.gl/REGISTER_ENTRY', payload: { id: 'kepler' } })
    state = reducer(state, loadFiles([file], () => {}))
    const loadingState = state.keplerGl

    state = reducer(state, loadFilesErr(file.name, error))

    expect(state.keplerGl).not.toBe(loadingState)
    expect(state.keplerGl.kepler.visState.fileLoadingProgress[file.name].error).toBe(error)
    expect(state.keplerGl.kepler.uiState.notifications).toEqual([])
    warn.mockRestore()
  })
})
