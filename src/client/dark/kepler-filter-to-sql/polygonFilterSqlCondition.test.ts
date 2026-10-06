import { describe, expect, it } from 'vitest'
import { deriveFilterClauses } from './index'
import type { ColumnBinding, Filter, LayerBinding, SqlCondition } from './index'

const polygon = { type: 'polygon', layerId: ['point'], value: { geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } } }
const point = (id = 'point', dataId = 'dataset', columns: Record<string, ColumnBinding | undefined> = { lng: { value: 'longitude', fieldIdx: 0 }, lat: { value: 'latitude', fieldIdx: 1 } }): LayerBinding => ({ id, type: 'point', config: { dataId, columnMode: 'points', columns } })

// Exercise spatial translation through the library's sole public function.
function polygonClause (filter: Pick<Filter, 'layerId' | 'value'>, dataId: string, layers: readonly LayerBinding[], columnTypes: Readonly<Record<string, string>> = {}): SqlCondition | null {
  const record: Filter = { id: 'area', type: 'polygon', dataId: [dataId], name: [], ...filter }
  return deriveFilterClauses([record], dataId, new Set(['area']), { layers, columnTypes })[0].sqlCondition
}

describe('polygon clauses', () => {
  it('filters points by finite coordinates and area', () => {
    expect(polygonClause(polygon, 'dataset', [point()])?.toString()).toContain('isfinite("longitude") AND isfinite("latitude") AND ST_Within(ST_Point("longitude", "latitude"), ST_GeomFromGeoJSON(')
    expect(polygonClause(polygon, 'dataset', [{ ...point(), type: 'icon' }])?.toString()).toContain('ST_Within(ST_Point("longitude", "latitude"),')
    expect(polygonClause(polygon, 'dataset', [{ ...point(), config: { ...point().config, columnMode: 'geojson' } }])).toBeNull()
  })

  it('checks bound altitude and quotes unusual column names', () => {
    const columns = { lng: { value: 'my lng', fieldIdx: 0 }, lat: { value: 'my lat"x', fieldIdx: 1 }, altitude: { value: 'height', fieldIdx: 2 } }
    const sql = polygonClause(polygon, 'dataset', [point('point', 'dataset', columns)])?.toString()
    expect(sql).toContain('isfinite("my lng") AND isfinite("my lat""x") AND isfinite("height")')
    expect(sql).toContain('ST_Point("my lng", "my lat""x")')
    expect(polygonClause(polygon, 'dataset', [point('point', 'dataset', { ...columns, altitude: { value: 'height', fieldIdx: -1 } })])?.toString()).not.toContain('height')
  })

  it('ANDs matching layers and skips deleted or other-dataset layers', () => {
    const two = { ...polygon, layerId: ['point', 'other', 'deleted'] }
    const layers = [point(), point('other', 'dataset', { lng: { value: 'east', fieldIdx: 0 }, lat: { value: 'north', fieldIdx: 1 } })]
    expect(polygonClause(two, 'dataset', layers)?.toString()).toContain(') AND (')
    expect(polygonClause(two, 'other-dataset', layers)).toBeNull()
    expect(polygonClause(two, 'dataset', [point('point', 'different')])).toBeNull()
  })

  it('uses only this dataset when a filter spans datasets', () => {
    const filter = { ...polygon, layerId: ['point', 'second'] }
    const layers = [point(), point('second', 'other', { lng: { value: 'east', fieldIdx: 0 }, lat: { value: 'north', fieldIdx: 1 } })]
    expect(polygonClause(filter, 'dataset', layers)?.toString()).toContain('"longitude"')
    expect(polygonClause(filter, 'dataset', layers)?.toString()).not.toContain('"east"')
    expect(polygonClause(filter, 'other', layers)?.toString()).toContain('"east"')
    expect(polygonClause(filter, 'other', layers)?.toString()).not.toContain('"longitude"')
  })

  it.each(['arc', 'line'])('requires both %s endpoints inside the polygon', type => {
    const columns = {
      lng0: { value: 'start lng', fieldIdx: 0 },
      lat0: { value: 'start lat', fieldIdx: 1 },
      lng1: { value: 'end lng', fieldIdx: 2 },
      lat1: { value: 'end lat', fieldIdx: 3 }
    }
    const clause = polygonClause(polygon, 'dataset', [{ id: 'point', type, config: { dataId: 'dataset', columnMode: 'points', columns } }])?.toString()
    expect(clause).toContain('ST_Point("start lng", "start lat")')
    expect(clause).toContain('ST_Point("end lng", "end lat")')
    expect(clause).toContain(') AND (')
  })

  it('requires finite bound line altitudes as Kepler does', () => {
    const columns = {
      lng0: { value: 'lng0', fieldIdx: 0 },
      lat0: { value: 'lat0', fieldIdx: 1 },
      alt0: { value: 'height0', fieldIdx: 2 },
      lng1: { value: 'lng1', fieldIdx: 3 },
      lat1: { value: 'lat1', fieldIdx: 4 },
      alt1: { value: 'height1', fieldIdx: 5 }
    }
    const layer = { id: 'point', type: 'line', config: { dataId: 'dataset', columnMode: 'points', columns } }
    const clause = polygonClause(polygon, 'dataset', [layer])?.toString()
    expect(clause).toContain('isfinite("height0")')
    expect(clause).toContain('isfinite("height1")')
  })

  it.each(['arc', 'line'])('skips %s layers without usable endpoint columns', type => {
    const layer = { id: 'point', type, config: { dataId: 'dataset', columnMode: 'geoarrow', columns: {} } }
    expect(polygonClause(polygon, 'dataset', [layer])).toBeNull()
    expect(polygonClause(polygon, 'dataset', [{ ...layer, config: { ...layer.config, columnMode: 'points' } }])).toBeNull()
  })

  it.each(['arc', 'line'])('checks both %s GeoArrow endpoints', type => {
    const columns = { geoarrow0: { value: 'start', fieldIdx: 0 }, geoarrow1: { value: 'end', fieldIdx: 1 } }
    const layer = { id: 'point', type, config: { dataId: 'dataset', columnMode: 'geoarrow', columns } }
    const clause = polygonClause(polygon, 'dataset', [layer], { start: 'DOUBLE[2]', end: 'DOUBLE[4]' })?.toString()
    expect(clause).toContain('ST_Point("start"[1], "start"[2])')
    expect(clause).toContain('ST_Point("end"[3], "end"[4])')
    expect(clause).toContain(') AND (')
    expect(polygonClause(polygon, 'dataset', [layer], { start: 'DOUBLE[2]', end: 'DOUBLE[2]' })).toBeNull()
  })

  it('checks H3 validity before testing the cell centroid', () => {
    const layer = { id: 'point', type: 'hexagonId', config: { dataId: 'dataset', columns: { hex_id: { value: 'my h3', fieldIdx: 0 } } } }
    const clause = polygonClause(polygon, 'dataset', [layer])?.toString()
    expect(clause).toContain('CASE WHEN h3_is_valid_cell("my h3") THEN')
    expect(clause).toContain('ST_Point(h3_cell_to_lng("my h3"), h3_cell_to_lat("my h3"))')
    expect(clause).toContain('ELSE false END')
    const stringClause = polygonClause(polygon, 'dataset', [layer], { 'my h3': 'VARCHAR' })?.toString()
    expect(stringClause).toContain('h3_is_valid_cell(TRY_CAST("my h3" AS UBIGINT))')
    expect(polygonClause(polygon, 'dataset', [{ ...layer, config: { ...layer.config, columns: { hex_id: { value: null, fieldIdx: -1 } } } }])).toBeNull()
  })

  it('reads GeoArrow point coordinates from a fixed-size array', () => {
    const layer = { id: 'point', type: 'point', config: { dataId: 'dataset', columnMode: 'geoarrow', columns: { geoarrow: { value: 'location', fieldIdx: 0 } } } }
    const clause = polygonClause(polygon, 'dataset', [layer], { location: 'DOUBLE[2]' })?.toString()
    expect(clause).toContain('isfinite("location"[1])')
    expect(clause).toContain('ST_Point("location"[1], "location"[2])')
    expect(polygonClause(polygon, 'dataset', [layer], { location: 'FLOAT[3]' })?.toString()).toContain('ST_Point("location"[1], "location"[2])')
    expect(polygonClause(polygon, 'dataset', [layer], { location: 'DOUBLE[1]' })).toBeNull()
    expect(polygonClause(polygon, 'dataset', [layer], { location: 'STRUCT(x DOUBLE, y DOUBLE)' })).toBeNull()
    expect(polygonClause(polygon, 'dataset', [layer], { location: 'UNKNOWN' })).toBeNull()
  })

  it('uses the bbox center of text geometry and accepts GeoJSON Features or WKT', () => {
    const layer = { id: 'point', type: 'geojson', config: { dataId: 'dataset', columnMode: 'geojson', columns: { geojson: { value: 'shape', fieldIdx: 0 } } } }
    const clause = polygonClause(polygon, 'dataset', [layer], { shape: 'VARCHAR' })?.toString()
    expect(clause).toContain('ST_XMin(')
    expect(clause).toContain('ST_XMax(')
    expect(clause).toContain('ST_GeomFromGeoJSON(')
    expect(clause).toContain('ST_GeomFromText(')
    expect(clause).toContain('$.geometry')
  })

  it('uses inclusive rectangle bounds for text geometry centers', () => {
    const rectangle = { ...polygon, value: { ...polygon.value, properties: { shape: 'Rectangle', bbox: [0, 0, 1, 1] } } }
    const layer = { id: 'point', type: 'geojson', config: { dataId: 'dataset', columnMode: 'geojson', columns: { geojson: { value: 'shape', fieldIdx: 0 } } } }
    const clause = polygonClause(rectangle, 'dataset', [layer], { shape: 'VARCHAR' })?.toString()
    expect(clause).toContain('BETWEEN 0 AND 1')
    expect(clause).not.toContain('ST_Within(')
  })

  it('matches Kepler empty maps for native geometry and skips unknown types', () => {
    const layer = { id: 'point', type: 'geojson', config: { dataId: 'dataset', columnMode: 'geojson', columns: { geojson: { value: 'shape', fieldIdx: 0 } } } }
    for (const type of ['GEOMETRY', 'BLOB']) expect(polygonClause(polygon, 'dataset', [layer], { shape: type })?.toString()).toBe('FALSE')
    expect(polygonClause(polygon, 'dataset', [layer], { shape: 'UNKNOWN' })).toBeNull()
    expect(polygonClause(polygon, 'dataset', [layer], {})).toBeNull()
  })

  it('does not invent a geometry predicate for point geojson mode', () => {
    const layer = { id: 'point', type: 'point', config: { dataId: 'dataset', columnMode: 'geojson', columns: { geojson: { value: 'shape', fieldIdx: 0 } } } }
    expect(polygonClause(polygon, 'dataset', [layer], { shape: 'VARCHAR' })).toBeNull()
  })

  it.each(['arc', 'line'])('converts H3 string endpoints for %s layers', type => {
    const columns = {
      lng0: { value: 'start_h3', fieldIdx: 0 },
      lat0: { value: 'start_h3', fieldIdx: 0 },
      lng1: { value: 'end_h3', fieldIdx: 1 },
      lat1: { value: 'end_h3', fieldIdx: 1 }
    }
    const layer = { id: 'point', type, config: { dataId: 'dataset', columnMode: 'points', columns } }
    const clause = polygonClause(polygon, 'dataset', [layer], { start_h3: 'VARCHAR', end_h3: 'VARCHAR' })?.toString()
    expect(clause).toContain('h3_is_valid_cell("start_h3")')
    expect(clause).toContain('h3_is_valid_cell("end_h3")')
    expect(clause).toContain('TRY_CAST("start_h3" AS UBIGINT)')
  })
})
