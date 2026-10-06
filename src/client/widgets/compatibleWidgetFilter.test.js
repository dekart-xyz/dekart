import { describe, expect, it } from 'vitest'
import { keplerFieldType } from './compatibleWidgetFilter'
import { resolveFilterBindings } from '../dark/kepler-filter-bindings/index'

describe('SQLRooms column fallback for a missing Kepler owner', () => {
  it('finds compatible live receiver fields while the owner is unavailable', () => {
    const tables = [
      { dataId: 'a', fields: [{ name: 'category', type: keplerFieldType('VARCHAR') }] },
      { dataId: 'b', fields: [{ name: 'category', type: 'string' }] }
    ]
    expect(resolveFilterBindings({ tables, primaryDataId: 'a', field: 'category', crossFilter: true, currentBindings: [] }).bindings).toEqual([
      { dataId: 'a', field: 'category' }, { dataId: 'b', field: 'category' }
    ])
  })

  it('maps SQL numeric types to Kepler numeric field types', () => {
    expect(keplerFieldType('BIGINT')).toBe('integer')
    expect(keplerFieldType('DOUBLE')).toBe('real')
    expect(keplerFieldType('custom')).toBe('custom')
  })
})
