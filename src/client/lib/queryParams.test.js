import { describe, expect, it } from 'vitest'
import { getQueryParamsHash, getQueryParamsState, reconcileQueryParamsState } from './queryParams'

describe('query parameter state', () => {
  it('initializes defaults without a mounted query-parameter UI', () => {
    const params = [{ name: 'region', defaultValue: 'EU' }]

    expect(getQueryParamsState(params, '')).toEqual({
      values: { region: 'EU' },
      url: 'qp_region=EU',
      hash: getQueryParamsHash(params, { region: 'EU' })
    })
  })

  it('preserves an unapplied draft across same-schema report updates', () => {
    const params = [{ name: 'region', label: 'Region', defaultValue: 'EU', type: 0 }]
    const applied = getQueryParamsState(params, '?qp_region=EU')

    expect(reconcileQueryParamsState({
      list: params,
      ...applied,
      values: { region: 'unapplied draft' }
    }, params, '?qp_region=EU')).toEqual({
      ...applied,
      values: { region: 'unapplied draft' }
    })
  })

  it('reinitializes parameters when the URL changes', () => {
    const params = [{ name: 'region', label: 'Region', defaultValue: 'EU', type: 0 }]
    const applied = getQueryParamsState(params, '?qp_region=EU')

    expect(reconcileQueryParamsState({ list: params, ...applied }, params, '?qp_region=US')).toEqual(
      getQueryParamsState(params, '?qp_region=US')
    )
  })
})
