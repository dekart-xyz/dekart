import { and, column, literal, sql } from '@uwdata/mosaic-sql'
import type { SqlCondition } from './filterSqlCondition'

/** A named column reference; a negative field index means an optional altitude binding is inactive. */
export interface ColumnBinding {
  value?: string | null
  fieldIdx?: number
}

/**
 * A layer selected by ID and data binding key. Supported bindings are:
 * point/icon: `lng`, `lat`, optional `altitude`; arc/line in `points` mode:
 * `lng0`, `lat0`, `lng1`, `lat1`, optional `alt0`/`alt1`; hexagonId: `hex_id`;
 * geojson: `geojson`; GeoArrow point: `geoarrow`; GeoArrow arc/line:
 * `geoarrow0`, `geoarrow1`. `columnMode` is `points`, `geoarrow`, or `geojson`
 * where applicable. Unsupported combinations contribute no condition.
 */
export interface LayerBinding {
  id: string
  type: string
  config: {
    dataId: string
    columnMode?: string
    columns: Record<string, ColumnBinding | undefined>
  }
}

/** An area filter with GeoJSON geometry and optional rectangle bounds. */
export interface PolygonFilter {
  type: 'polygon'
  layerId?: string[]
  value: {
    geometry: { type: string, coordinates: unknown }
    properties?: { shape?: string, bbox?: number[] }
  }
}

// Kepler 3.2.6: filter-utils.js getPolygonFilterFunctor (356) and
// point-layer.js / icon-layer.js getPositionAccessor.
// polygon -> matching dataset layers -> AND
//   point/icon + lat/lng columns -> finite coordinates + point within polygon
//   arc/line + two endpoints      -> both points within polygon
//   hexagonId + H3 column        -> valid cell centroid within polygon
//   geojson + text geometry      -> bbox center within polygon
//   geojson + GEOMETRY/BLOB      -> false, matching Kepler's empty WKB result
//   other layer types            -> no clause

// Bound coordinate columns must have names when the matching layer is configured.
function boundName (binding: ColumnBinding | undefined): string {
  if (binding?.value === undefined || binding.value === null) throw new Error('Layer has no bound column.')
  return binding.value
}

// Match Kepler's finite position check before testing the point against the area.
function pointClause (columns: LayerBinding['config']['columns'], polygon: SqlCondition): SqlCondition {
  const lng = column(boundName(columns.lng))
  const lat = column(boundName(columns.lat))
  const altitude = (columns.altitude?.fieldIdx ?? -1) > -1 ? sql` AND isfinite(${column(boundName(columns.altitude))})` : sql``
  return sql`(isfinite(${lng}) AND isfinite(${lat})${altitude} AND ST_Within(ST_Point(${lng}, ${lat}), ${polygon}))`
}

// H3-backed positions are converted to the same cell centroids Kepler tests.
function h3Clause (name: string, polygon: SqlCondition, type?: string): SqlCondition {
  const id = column(name)
  if (type === 'VARCHAR') {
    // Kepler accepts hexadecimal strings and also converts decimal strings to H3 integers.
    const decimal = sql`TRY_CAST(${id} AS UBIGINT)`
    return sql`CASE WHEN h3_is_valid_cell(${id}) THEN ST_Within(ST_Point(h3_cell_to_lng(${id}), h3_cell_to_lat(${id})), ${polygon}) WHEN h3_is_valid_cell(${decimal}) THEN ST_Within(ST_Point(h3_cell_to_lng(${decimal}), h3_cell_to_lat(${decimal})), ${polygon}) ELSE false END`
  }
  return sql`CASE WHEN h3_is_valid_cell(${id}) THEN ST_Within(ST_Point(h3_cell_to_lng(${id}), h3_cell_to_lat(${id})), ${polygon}) ELSE false END`
}

// Kepler prefers an H3 string in the latitude field, then the longitude field.
function endpointClause (columns: LayerBinding['config']['columns'], polygon: SqlCondition, columnTypes: Readonly<Record<string, string>>): SqlCondition {
  const h3 = [columns.lat, columns.lng].find(bound => bound?.value !== undefined && bound.value !== null && columnTypes[bound.value] === 'VARCHAR')
  const inside = h3 !== undefined ? h3Clause(boundName(h3), polygon, columnTypes[boundName(h3)]) : pointClause(columns, polygon)
  const altitude = (columns.altitude?.fieldIdx ?? -1) > -1 ? sql`isfinite(${column(boundName(columns.altitude))})` : null
  return altitude !== null && h3 !== undefined ? and(inside, altitude) : inside
}

// Text geometry is parsed per row so malformed values exclude only that row.
function textGeometry (name: string): SqlCondition {
  const value = sql`CAST(${column(name)} AS VARCHAR)`
  return sql`TRY(CASE WHEN json_valid(${value}) THEN ST_GeomFromGeoJSON(CASE WHEN json_extract_string(${value}, '$.type') = 'Feature' THEN json_extract_string(${value}, '$.geometry') ELSE ${value} END) ELSE ST_GeomFromText(${value}) END)`
}

// Turf's center uses the midpoint of the geometry bounds, not its centroid.
function geojsonClause (name: string | null | undefined, type: string | undefined, filter: PolygonFilter, polygon: SqlCondition): SqlCondition | null {
  if (type === 'GEOMETRY' || type === 'BLOB') {
    // charts copy Kepler's empty WKB polygon result; upgrade when Kepler gains WKB centroids.
    return literal(false)
  }
  if (type !== 'VARCHAR' && type !== 'JSON') return null
  const geometry = textGeometry(boundName({ value: name }))
  const x = sql`(ST_XMin(${geometry}) + ST_XMax(${geometry})) / 2`
  const y = sql`(ST_YMin(${geometry}) + ST_YMax(${geometry})) / 2`
  const bbox = filter.value.properties?.shape === 'Rectangle' ? filter.value.properties.bbox : undefined
  if (bbox?.length === 4) {
    const [minX, minY, maxX, maxY] = bbox.map(literal)
    return sql`(${x} BETWEEN ${minX} AND ${maxX} AND ${y} BETWEEN ${minY} AND ${maxY})`
  }
  return sql`ST_Within(ST_Point(${x}, ${y}), ${polygon})`
}

// Kepler's GeoArrow accessors read point coordinates from an Arrow FixedSizeList.
function geoarrowPointClause (name: string | null | undefined, type: string | undefined, polygon: SqlCondition, firstIndex = 1): SqlCondition | null {
  const arrayType = /^(?:FLOAT|DOUBLE)\[(\d+)\]$/.exec(type ?? '')
  if (name === undefined || name === null || name === '' || arrayType === null || Number(arrayType[1]) < firstIndex + 1) return null
  const value = column(name)
  const x = sql`${value}[${literal(firstIndex)}]`
  const y = sql`${value}[${literal(firstIndex + 1)}]`
  return sql`(isfinite(${x}) AND isfinite(${y}) AND ST_Within(ST_Point(${x}, ${y}), ${polygon}))`
}

/**
 * Return the conjunction of supported layer SQL conditions for a binding key, or null
 * when no bound layer is supported. Invalid geometry may throw. Mosaic SQL builders
 * escape identifiers and polygon values; inputs are unchanged and SQL is not executed.
 */
export function polygonFilterSqlCondition (filter: PolygonFilter, datasetId: string, layers: readonly LayerBinding[], columnTypes: Readonly<Record<string, string>> = {}): SqlCondition | null {
  const polygon = sql`ST_GeomFromGeoJSON(${literal(JSON.stringify(filter.value.geometry))})`
  const clauses = (filter.layerId ?? []).map(id => layers.find(layer => layer.id === id && layer.config.dataId === datasetId)).filter((layer): layer is LayerBinding => layer !== undefined).map(layer => {
    if (layer.type === 'point' && layer.config.columnMode === 'geoarrow') {
      const name = layer.config.columns.geoarrow?.value
      return geoarrowPointClause(name, name !== undefined && name !== null && name !== '' ? columnTypes[name] : undefined, polygon)
    }
    if ((layer.type === 'point' && layer.config.columnMode !== 'geojson') || layer.type === 'icon') {
      return pointClause(layer.config.columns, polygon)
    }
    // Kepler keeps a line only when both finite endpoints are inside the area.
    if ((layer.type === 'arc' || layer.type === 'line') && layer.config.columnMode === 'geoarrow') {
      const { geoarrow0, geoarrow1 } = layer.config.columns
      const startName = geoarrow0?.value
      const endName = geoarrow1?.value
      const start = geoarrowPointClause(startName, startName !== undefined && startName !== null && startName !== '' ? columnTypes[startName] : undefined, polygon)
      const end = geoarrowPointClause(endName, endName !== undefined && endName !== null && endName !== '' ? columnTypes[endName] : undefined, polygon, 3)
      return start !== null && end !== null ? and(start, end) : null
    }
    if ((layer.type === 'arc' || layer.type === 'line') && layer.config.columnMode === 'points') {
      const { lng0, lat0, alt0, lng1, lat1, alt1 } = layer.config.columns
      // A partially configured layer has no usable pair of map positions yet.
      if (![lng0, lat0, lng1, lat1].every(bound => bound?.value)) return null
      const start = { lng: lng0, lat: lat0, altitude: layer.type === 'line' ? alt0 : undefined }
      const end = { lng: lng1, lat: lat1, altitude: layer.type === 'line' ? alt1 : undefined }
      return and(endpointClause(start, polygon, columnTypes), endpointClause(end, polygon, columnTypes))
    }
    // Invalid H3 cells cannot supply a centroid and must not reach conversion functions.
    if (layer.type === 'hexagonId') {
      const name = layer.config.columns.hex_id?.value
      if (name === undefined || name === null || name === '') return null
      return h3Clause(name, polygon, columnTypes[name])
    }
    if (layer.type === 'geojson') {
      const name = layer.config.columns.geojson?.value
      return geojsonClause(name, name !== undefined && name !== null && name !== '' ? columnTypes[name] : undefined, filter, polygon)
    }
    return null
  }).filter((clause): clause is SqlCondition => clause !== null)
  return clauses.length > 0 ? clauses.reduce((left, right) => and(left, right)) : null
}
