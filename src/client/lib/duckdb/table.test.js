import { tableFromArrays } from 'apache-arrow'
import { describe, expect, it } from 'vitest'
import { compactArrowColumns, DekartDuckDBTable } from './table'

describe('compactArrowColumns', () => {
  it('coalesces aligned numeric, text and null chunks for one display batch', () => {
    const first = tableFromArrays({
      longitude: new Float64Array([1, 2]),
      district: [1, null],
      label: ['a', null]
    })
    const second = tableFromArrays({
      longitude: new Float64Array([3]),
      district: [3],
      label: ['c']
    })
    const table = first.concat(second)

    const columns = compactArrowColumns([
      table.getChild('longitude'),
      table.getChild('district'),
      table.getChild('label')
    ])

    expect(columns.every(column => column.data.length === 1)).toBe(true)
    expect([...columns[0]]).toEqual([1, 2, 3])
    expect([...columns[1]]).toEqual([1, null, 3])
    expect([...columns[2]]).toEqual(['a', null, 'c'])
  })

  it('derives display fields from a DuckDB Arrow result', async () => {
    const dataset = new DekartDuckDBTable({ info: { id: 'dataset', label: 'Query 1' } })
    const result = tableFromArrays({ primary_type: ['THEFT'], longitude: [1] })

    const display = await dataset.createTableAndGetArrow({ dekartArrowTable: result })

    expect(display.fields.map(field => field.name)).toEqual(['primary_type', 'longitude'])
  })
})
