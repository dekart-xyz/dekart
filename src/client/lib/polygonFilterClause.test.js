import { describe, expect, it } from 'vitest'
import { polygonFilterClause } from './polygonFilterClause'

const polygon = { layerId: ['point'], value: { geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } } }
const point = (id = 'point', dataId = 'dataset', columns = { lng: { value: 'longitude', fieldIdx: 0 }, lat: { value: 'latitude', fieldIdx: 1 } }) => ({ id, type: 'point', config: { dataId, columnMode: 'points', columns } })

describe('polygonFilterClause', () => {
  it('filters points by finite coordinates and area', () => {
    expect(polygonFilterClause(polygon, 'dataset', [point()]).toString()).toContain('isfinite("longitude") AND isfinite("latitude") AND ST_Within(ST_Point("longitude", "latitude"), ST_GeomFromGeoJSON(')
    expect(polygonFilterClause(polygon, 'dataset', [{ ...point(), type: 'icon' }]).toString()).toContain('ST_Within(ST_Point("longitude", "latitude"),')
    expect(polygonFilterClause(polygon, 'dataset', [{ ...point(), config: { ...point().config, columnMode: 'geojson' } }])).toBeNull()
  })

  it('checks bound altitude and quotes unusual column names', () => {
    const columns = { lng: { value: 'my lng', fieldIdx: 0 }, lat: { value: 'my lat"x', fieldIdx: 1 }, altitude: { value: 'height', fieldIdx: 2 } }
    const sql = polygonFilterClause(polygon, 'dataset', [point('point', 'dataset', columns)]).toString()
    expect(sql).toContain('isfinite("my lng") AND isfinite("my lat""x") AND isfinite("height")')
    expect(sql).toContain('ST_Point("my lng", "my lat""x")')
    expect(polygonFilterClause(polygon, 'dataset', [point('point', 'dataset', { ...columns, altitude: { value: 'height', fieldIdx: -1 } })]).toString()).not.toContain('height')
  })

  it('ANDs matching layers and skips deleted or other-dataset layers', () => {
    const two = { ...polygon, layerId: ['point', 'other', 'deleted'] }
    const layers = [point(), point('other', 'dataset', { lng: { value: 'east', fieldIdx: 0 }, lat: { value: 'north', fieldIdx: 1 } })]
    expect(polygonFilterClause(two, 'dataset', layers).toString()).toContain(') AND (')
    expect(polygonFilterClause(two, 'other-dataset', layers)).toBeNull()
    expect(polygonFilterClause(two, 'dataset', [point('point', 'different')])).toBeNull()
  })

  it('uses only this dataset when a filter spans datasets', () => {
    const filter = { ...polygon, layerId: ['point', 'second'] }
    const layers = [point(), point('second', 'other', { lng: { value: 'east', fieldIdx: 0 }, lat: { value: 'north', fieldIdx: 1 } })]
    expect(polygonFilterClause(filter, 'dataset', layers).toString()).toContain('"longitude"')
    expect(polygonFilterClause(filter, 'dataset', layers).toString()).not.toContain('"east"')
    expect(polygonFilterClause(filter, 'other', layers).toString()).toContain('"east"')
    expect(polygonFilterClause(filter, 'other', layers).toString()).not.toContain('"longitude"')
  })
})
