import { describe, expect, it } from 'vitest'
import { literal } from '@uwdata/mosaic-sql'
import { deriveFilterClauses } from './index'
import type { Filter, FilterClause } from './index'
// Exercise scalar translation through the library's public entry point.
function scalarClause (filter: Filter): FilterClause {
  return deriveFilterClauses([filter], 'a', new Set([filter.id]), () => null)[0]
}

const category: Filter = { id: 'category-selection', type: 'multiSelect', dataId: ['a', 'b'], name: ['category', 'category'], value: ['Alpha'] }
describe('executable filter contracts', () => {
  it('sqlCondition', () => {
    expect(String(scalarClause(category).sqlCondition)).toBe('("category" IN (\'Alpha\'))')
    expect(String(scalarClause({ ...category, type: 'select', value: 7 }).sqlCondition)).toBe('("category" IN (7))')
    expect(String(scalarClause({ ...category, type: 'range', value: [10.5, 20.5] }).sqlCondition)).toBe('("category" BETWEEN 10.5 AND 20.5)')
    expect(String(scalarClause({ ...category, value: [] }).sqlCondition)).toBe('FALSE')
    expect(scalarClause({ ...category, enabled: false }).sqlCondition).toBeNull()
  })
  it('hostile', () => {
    const hostile = { ...category, name: ['odd"field'], value: ["O'Brien\\<script>"] }
    expect(String(scalarClause(hostile).sqlCondition)).toBe('("odd""field" IN (\'O\'\'Brien\\<script>\'))')
  })
  it('invalid', () => {
    expect(() => scalarClause({ ...category, name: [] })).toThrow('no field')
    expect(() => scalarClause({ ...category, type: 'timeRange' }).sqlCondition).toThrow('not supported')
    expect(() => scalarClause({ ...category, type: 'range', value: [] }).sqlCondition).toThrow('two bounds')
    expect(() => scalarClause({ ...category, value: null }).sqlCondition).toThrow('array')
  })
  it('clauses', () => {
    const active = new Set([category.id, 'area'])
    const area: Filter = { ...category, id: 'area', type: 'polygon', value: {} }
    const filters = [category, area]
    const spatial = (): ReturnType<typeof literal> => literal(true)
    const clauses = deriveFilterClauses(filters, 'a', active, spatial)
    expect(String(clauses[0].sqlCondition)).toBe('("category" IN (\'Alpha\'))')
    expect(clauses[1].field).toBeNull()
    expect(String(clauses[1].sqlCondition)).toBe('TRUE')
    expect(deriveFilterClauses([{ ...category, name: ['category', 'otherCategory'] }], 'b', active, spatial)[0].field).toBe('otherCategory')
    expect(deriveFilterClauses(filters, 'missing', active, spatial)).toEqual([])
    expect(deriveFilterClauses([{ ...category, enabled: false }], 'a', active, spatial)[0].sqlCondition).toBeNull()
    expect(deriveFilterClauses(filters, 'a', new Set(), spatial).every(clause => clause.sqlCondition === null)).toBe(true)
  })
})
