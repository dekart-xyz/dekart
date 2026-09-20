import { describe, expect, it } from 'vitest'
import { nativeFilterPredicate } from './nativeFilterPredicate'

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
    expect(() => nativeFilterPredicate(filter('polygon', {}), 'dataset')).toThrow('Map filter type polygon is not available for charts.')
  })
})
