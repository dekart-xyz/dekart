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

  it('recognizes PostGIS GeoJSON returned as DuckDB VARCHAR', async () => {
    const dataset = new DekartDuckDBTable({ info: { id: 'dataset', label: 'Query 1' } })
    const geometry = JSON.stringify({
      type: 'Polygon',
      coordinates: [[
        [-118.08, 33.78],
        [-118.07, 33.78],
        [-118.07, 33.79],
        [-118.08, 33.78]
      ]]
    })
    const result = tableFromArrays({ geometry: [...Array(51).fill(null), geometry] })

    const display = await dataset.createTableAndGetArrow({
      dekartArrowTable: result,
      dekartTypeMap: { geometry: 'VARCHAR' }
    })

    expect(display.fields[0]).toMatchObject({
      type: 'geojson',
      analyzerType: 'GEOMETRY_FROM_STRING'
    })
  })

  it('recognizes a PostGIS record returned as a GeoJSON Feature', async () => {
    const dataset = new DekartDuckDBTable({ info: { id: 'dataset', label: 'Query 1' } })
    const feature = JSON.stringify({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-118.08, 33.78] },
      properties: { id: 1 }
    })
    const result = tableFromArrays({ feature: [feature] })

    const display = await dataset.createTableAndGetArrow({
      dekartArrowTable: result,
      dekartTypeMap: { feature: 'VARCHAR' }
    })

    expect(display.fields[0]).toMatchObject({
      type: 'geojson',
      analyzerType: 'GEOMETRY_FROM_STRING'
    })
  })

  it('keeps ordinary JSON returned as DuckDB VARCHAR non-geospatial', async () => {
    const dataset = new DekartDuckDBTable({ info: { id: 'dataset', label: 'Query 1' } })
    const result = tableFromArrays({ metadata: [JSON.stringify({ type: 'Polygon', category: 'building' })] })

    const display = await dataset.createTableAndGetArrow({
      dekartArrowTable: result,
      dekartTypeMap: { metadata: 'VARCHAR' }
    })

    expect(display.fields[0]).toMatchObject({
      type: 'object',
      analyzerType: 'OBJECT'
    })
  })
})
