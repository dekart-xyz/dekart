/* eslint-env jest */

import { shouldAddQuery } from './shouldAddQuery'

describe('shouldAddQuery', () => {
  it('should return true if query is not loaded', () => {
    expect(shouldAddQuery({ jobResultId: '1' }, null, null)).toEqual(true)
  })
  it('should return true if query is loaded and has not been loaded before', () => {
    expect(shouldAddQuery({ jobResultId: '1' }, null, [{ id: '2' }])).toEqual(true)
  })
  it('should return true if query is loaded and has been loaded before but jobResultId has changed', () => {
    expect(shouldAddQuery({ id: '1', jobResultId: '1' }, [{ id: '1', jobResultId: '2' }], [{ id: '1', jobResultId: '1' }])).toEqual(true)
  })
  it('should return false if query is loaded and has been loaded before and jobResultId has not changed', () => {
    expect(shouldAddQuery({ id: '1', jobResultId: '1' }, [{ id: '1', jobResultId: '1' }], [{ id: '1', jobResultId: '1' }])).toEqual(false)
  })
  it('should return false if query is not loaded and has been loaded before', () => {
    expect(shouldAddQuery({ id: '1' }, [{ id: '1', jobResultId: '1' }], [{ id: '1', jobResultId: '1' }])).toEqual(false)
  })
  it('should return true if query is loaded and has not been loaded before but queriesList length has changed', () => {
    expect(shouldAddQuery({ id: '1', jobResultId: '1' }, null, [{ id: '1', jobResultId: '1' }, { id: '2', jobResultId: '2' }])).toEqual(true)
  })
  it('should return false if query was loaded before and new empty query added', () => {
    expect(shouldAddQuery({ id: '1', jobResultId: '1' }, [{ id: '1', jobResultId: '1' }], [{ id: '1', jobResultId: '1' }, { id: '2' }])).toEqual(false)
  })
})
