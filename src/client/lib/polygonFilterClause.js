// REVIEW: Translate point and icon layer polygon filters into finite-coordinate spatial SQL for matching chart datasets.
import { and, column, literal, sql } from '@uwdata/mosaic-sql'

// Kepler 3.2.6: filter-utils.js getPolygonFilterFunctor (356) and
// point-layer.js / icon-layer.js getPositionAccessor.
// polygon -> matching dataset layers -> AND
//   point/icon + lat/lng columns -> finite coordinates + point within polygon
//   arc/line + two endpoints      -> both points within polygon
//   hexagonId + H3 column        -> valid cell centroid within polygon
//   geojson + text geometry      -> bbox center within polygon
//   geojson + GEOMETRY/BLOB      -> false, matching Kepler's empty WKB result
//   other layer types            -> no clause

// Match Kepler's finite position check before testing the point against the area.
function pointClause (columns, polygon) {
  const lng = column(columns.lng.value)
  const lat = column(columns.lat.value)
  const altitude = columns.altitude?.fieldIdx > -1 ? sql` AND isfinite(${column(columns.altitude.value)})` : sql``
  return sql`(isfinite(${lng}) AND isfinite(${lat})${altitude} AND ST_Within(ST_Point(${lng}, ${lat}), ${polygon}))`
}

// H3-backed positions are converted to the same cell centroids Kepler tests.
function h3Clause (name, polygon, type) {
  const id = column(name)
  if (type === 'VARCHAR') {
    // Kepler accepts hexadecimal strings and also converts decimal strings to H3 integers.
    const decimal = sql`TRY_CAST(${id} AS UBIGINT)`
    return sql`CASE WHEN h3_is_valid_cell(${id}) THEN ST_Within(ST_Point(h3_cell_to_lng(${id}), h3_cell_to_lat(${id})), ${polygon}) WHEN h3_is_valid_cell(${decimal}) THEN ST_Within(ST_Point(h3_cell_to_lng(${decimal}), h3_cell_to_lat(${decimal})), ${polygon}) ELSE false END`
  }
  return sql`CASE WHEN h3_is_valid_cell(${id}) THEN ST_Within(ST_Point(h3_cell_to_lng(${id}), h3_cell_to_lat(${id})), ${polygon}) ELSE false END`
}

// Kepler prefers an H3 string in the latitude field, then the longitude field.
function endpointClause (columns, polygon, columnTypes) {
  const h3 = [columns.lat, columns.lng].find(bound => columnTypes?.[bound.value] === 'VARCHAR')
  const inside = h3 ? h3Clause(h3.value, polygon, columnTypes[h3.value]) : pointClause(columns, polygon)
  const altitude = columns.altitude?.fieldIdx > -1 ? sql`isfinite(${column(columns.altitude.value)})` : null
  return altitude && h3 ? and(inside, altitude) : inside
}

// Text geometry is parsed per row so malformed values exclude only that row.
function textGeometry (name) {
  const value = sql`CAST(${column(name)} AS VARCHAR)`
  return sql`TRY(CASE WHEN json_valid(${value}) THEN ST_GeomFromGeoJSON(CASE WHEN json_extract_string(${value}, '$.type') = 'Feature' THEN json_extract_string(${value}, '$.geometry') ELSE ${value} END) ELSE ST_GeomFromText(${value}) END)`
}

// Turf's center uses the midpoint of the geometry bounds, not its centroid.
function geojsonClause (name, type, filter, polygon) {
  if (type === 'GEOMETRY' || type === 'BLOB') {
    // charts copy Kepler's empty WKB polygon result; upgrade when Kepler gains WKB centroids.
    return literal(false)
  }
  if (type !== 'VARCHAR' && type !== 'JSON') return null
  const geometry = textGeometry(name)
  const x = sql`(ST_XMin(${geometry}) + ST_XMax(${geometry})) / 2`
  const y = sql`(ST_YMin(${geometry}) + ST_YMax(${geometry})) / 2`
  const bbox = filter.value.properties?.shape === 'Rectangle' && filter.value.properties?.bbox
  if (bbox?.length === 4) {
    const [minX, minY, maxX, maxY] = bbox.map(literal)
    return sql`(${x} BETWEEN ${minX} AND ${maxX} AND ${y} BETWEEN ${minY} AND ${maxY})`
  }
  return sql`ST_Within(ST_Point(${x}, ${y}), ${polygon})`
}

// Kepler's GeoArrow accessors read point coordinates from an Arrow FixedSizeList.
function geoarrowPointClause (name, type, polygon, firstIndex = 1) {
  const arrayType = /^(?:FLOAT|DOUBLE)\[(\d+)\]$/.exec(type || '')
  if (!name || !arrayType || Number(arrayType[1]) < firstIndex + 1) return null
  const value = column(name)
  const x = sql`${value}[${literal(firstIndex)}]`
  const y = sql`${value}[${literal(firstIndex + 1)}]`
  return sql`(isfinite(${x}) AND isfinite(${y}) AND ST_Within(ST_Point(${x}, ${y}), ${polygon}))`
}

// Return the conjunction of supported layer predicates for this dataset.
// turns one Kepler map-area filter into a SQL condition for a chart
export function polygonFilterClause (filter, datasetId, layers, columnTypes) {
  const polygon = sql`ST_GeomFromGeoJSON(${literal(JSON.stringify(filter.value.geometry))})`
  const clauses = (filter.layerId || []).map(id => layers.find(layer => layer.id === id && layer.config.dataId === datasetId)).filter(Boolean).map(layer => {
    if (layer.type === 'point' && layer.config.columnMode === 'geoarrow') {
      const name = layer.config.columns.geoarrow?.value
      return geoarrowPointClause(name, columnTypes?.[name], polygon)
    }
    if ((layer.type === 'point' && layer.config.columnMode !== 'geojson') || layer.type === 'icon') {
      return pointClause(layer.config.columns, polygon)
    }
    // Kepler keeps a line only when both finite endpoints are inside the area.
    if ((layer.type === 'arc' || layer.type === 'line') && layer.config.columnMode === 'geoarrow') {
      const { geoarrow0, geoarrow1 } = layer.config.columns
      const start = geoarrowPointClause(geoarrow0?.value, columnTypes?.[geoarrow0?.value], polygon)
      const end = geoarrowPointClause(geoarrow1?.value, columnTypes?.[geoarrow1?.value], polygon, 3)
      return start && end ? and(start, end) : null
    }
    if ((layer.type === 'arc' || layer.type === 'line') && layer.config.columnMode === 'points') {
      const { lng0, lat0, alt0, lng1, lat1, alt1 } = layer.config.columns
      // A partially configured layer has no usable pair of map positions yet.
      if (![lng0, lat0, lng1, lat1].every(bound => bound?.value)) return null
      const start = { lng: lng0, lat: lat0, altitude: layer.type === 'line' ? alt0 : null }
      const end = { lng: lng1, lat: lat1, altitude: layer.type === 'line' ? alt1 : null }
      return and(endpointClause(start, polygon, columnTypes), endpointClause(end, polygon, columnTypes))
    }
    // Invalid H3 cells cannot supply a centroid and must not reach conversion functions.
    if (layer.type === 'hexagonId') {
      const name = layer.config.columns.hex_id?.value
      if (!name) return null
      return h3Clause(name, polygon, columnTypes?.[name])
    }
    if (layer.type === 'geojson') return geojsonClause(layer.config.columns.geojson?.value, columnTypes?.[layer.config.columns.geojson?.value], filter, polygon)
    return null
  }).filter(Boolean)
  return clauses.length ? clauses.reduce((left, right) => and(left, right)) : null
}
