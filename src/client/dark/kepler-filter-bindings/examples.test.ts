import { describe, expect, it } from 'vitest'
import { resolveFilterBindings } from './index'

describe('filter bindings', () => {
  const tables = [
    { dataId: 'a', fields: [{ name: 'id', type: 'integer' }] },
    { dataId: 'b', fields: [{ name: 'id', type: 'real' }, { name: 'other', type: 'integer' }] },
    { dataId: 'c', fields: [{ name: 'id', type: 'string' }] }
  ]
  it('matches exact names and numeric classes while validating saved pairs by their own names', () => {
    const result = resolveFilterBindings({
      tables,
      primaryDataId: 'a',
      field: 'id',
      crossFilter: true,
      currentBindings: [{ dataId: 'a', field: 'id' }, { dataId: 'b', field: 'other' }, { dataId: 'c', field: 'id' }]
    })
    expect(result.matchingDataIds).toEqual(['b'])
    expect(result.skippedDataIds).toEqual(['c'])
    expect(result.compatibleDataIds).toEqual(['a', 'b'])
    expect(result.bindings).toEqual([{ dataId: 'a', field: 'id' }, { dataId: 'b', field: 'id' }])
  })
  it('preserves saved pairs when the primary field is unavailable', () => {
    const currentBindings = [{ dataId: 'a', field: 'lost' }]
    expect(resolveFilterBindings({ tables, primaryDataId: 'a', field: 'lost', crossFilter: true, currentBindings }).bindings).toBe(currentBindings)
  })

  it.each([
    ['string', 'string', true],
    ['date', 'timestamp', false],
    ['boolean', 'string', false],
    ['custom', 'custom', true],
    ['custom', 'CUSTOM', false],
    ['VARCHAR', 'string', false],
    ['VARCHAR', 'VARCHAR', true],
    ['bigint', 'integer', false]
  ])('compares %s with %s by its field class', (ownerType, receiverType, compatible) => {
    const result = resolveFilterBindings({
      tables: [
        { dataId: 'a', fields: [{ name: 'Name', type: ownerType }] },
        { dataId: 'b', fields: [{ name: 'Name', type: receiverType }] },
        { dataId: 'c', fields: [{ name: 'name', type: ownerType }] }
      ],
      primaryDataId: 'a',
      field: 'Name',
      crossFilter: true,
      currentBindings: []
    })
    expect(result.matchingDataIds).toEqual(compatible ? ['b'] : [])
    expect(result.skippedDataIds).toEqual(compatible ? [] : ['b'])
  })
})
