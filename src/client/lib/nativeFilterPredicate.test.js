import { describe, expect, it } from 'vitest'
import { nativeFilterField, nativeFilterPredicate } from './nativeFilterPredicate'

const filter = (type, value, extra = {}) => ({
  type,
  value,
  enabled: true,
  dataId: ['dataset'],
  name: ['district'],
  ...extra
})

describe('nativeFilterPredicate', () => {
  it('converts category and range filters to bounded SQL predicates', () => {
    expect(nativeFilterPredicate(filter('select', 7), 'dataset').toString()).toBe('("district" IN (7))')
    expect(nativeFilterPredicate(filter('multiSelect', ['THEFT', 'BATTERY']), 'dataset').toString()).toBe('("district" IN (\'THEFT\', \'BATTERY\'))')
    expect(nativeFilterPredicate(filter('range', [10, 20]), 'dataset').toString()).toBe('("district" BETWEEN 10 AND 20)')
  })

  it('omits disabled filters and rejects unsupported semantics', () => {
    expect(nativeFilterPredicate(filter('range', [10, 20], { enabled: false }), 'dataset')).toBeNull()
    expect(() => nativeFilterPredicate(filter('unsupported', {}), 'dataset')).toThrow('Map filter type unsupported is not available for charts.')
  })

  it('uses fields only for scalar filters and keeps their SQL unchanged alongside polygons', () => {
    const range = filter('range', [10, 20])
    const polygon = filter('polygon', { geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }, { name: ['Point layer'], layerId: ['point'] })
    const layers = [{ id: 'point', type: 'point', config: { dataId: 'dataset', columnMode: 'points', columns: { lng: { value: 'longitude', fieldIdx: 0 }, lat: { value: 'latitude', fieldIdx: 1 } } } }]
    expect(nativeFilterField(range, 'dataset')).toBe('district')
    expect(nativeFilterField(range, 'other')).toBeNull()
    expect(nativeFilterField(polygon, 'dataset')).toBeNull()
    expect(nativeFilterPredicate(range, 'dataset', layers).toString()).toBe('("district" BETWEEN 10 AND 20)')
    expect(nativeFilterPredicate(polygon, 'dataset', layers).toString()).toContain('ST_Within')
    expect(nativeFilterPredicate({ ...polygon, enabled: false }, 'dataset', layers)).toBeNull()
  })
})
