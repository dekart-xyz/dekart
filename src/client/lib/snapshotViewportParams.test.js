import { describe, expect, it } from 'vitest'
import { getSnapshotViewportMapUpdate, getSnapshotViewportParams } from './snapshotViewportParams'

describe('getSnapshotViewportParams', () => {
  it('returns valid zoom and center overrides', () => {
    expect(getSnapshotViewportParams('?zoom=12&lat=52.52&lon=13.405')).toEqual({
      zoom: 12,
      latitude: 52.52,
      longitude: 13.405
    })
  })

  it('keeps valid partial zoom and ignores incomplete center', () => {
    expect(getSnapshotViewportParams('?zoom=0&lat=52.52')).toEqual({
      zoom: 0
    })
  })

  it('ignores invalid values', () => {
    expect(getSnapshotViewportParams('?zoom=25&lat=-91&lon=181')).toBeNull()
  })
})

describe('getSnapshotViewportMapUpdate', () => {
  it('returns only changed viewport fields', () => {
    expect(getSnapshotViewportMapUpdate(
      { zoom: 9, latitude: 37.7749, longitude: -122.4194 },
      { zoom: 12, latitude: 52.52, longitude: 13.405 }
    )).toEqual({
      zoom: 12,
      latitude: 52.52,
      longitude: 13.405
    })
  })

  it('returns empty update when the map already has requested viewport', () => {
    expect(getSnapshotViewportMapUpdate(
      { zoom: 12, latitude: 52.52, longitude: 13.405 },
      { zoom: 12, latitude: 52.52, longitude: 13.405 }
    )).toEqual({})
  })
})
