// REVIEW: Translate point and icon layer polygon filters into finite-coordinate spatial SQL for matching chart datasets.
import { and, column, literal, sql } from '@uwdata/mosaic-sql'

// Kepler 3.2.6: filter-utils.js getPolygonFilterFunctor (356) and
// point-layer.js / icon-layer.js getPositionAccessor.
// polygon -> matching dataset layers -> AND
//   point/icon + lat/lng columns -> finite coordinates + point within polygon
//   other layer types             -> no clause (later delivery slices)

// Match Kepler's finite position check before testing the point against the area.
function pointClause (columns, polygon) {
  const lng = column(columns.lng.value)
  const lat = column(columns.lat.value)
  const altitude = columns.altitude?.fieldIdx > -1 ? sql` AND isfinite(${column(columns.altitude.value)})` : sql``
  return sql`(isfinite(${lng}) AND isfinite(${lat})${altitude} AND ST_Within(ST_Point(${lng}, ${lat}), ${polygon}))`
}

// Return the conjunction of supported layer predicates for this dataset.
export function polygonFilterClause (filter, datasetId, layers) {
  const polygon = sql`ST_GeomFromGeoJSON(${literal(JSON.stringify(filter.value.geometry))})`
  const clauses = (filter.layerId || []).map(id => layers.find(layer => layer.id === id && layer.config.dataId === datasetId)).filter(Boolean).map(layer => {
    if ((layer.type === 'point' && layer.config.columnMode !== 'geojson' && layer.config.columnMode !== 'geoarrow') || layer.type === 'icon') {
      return pointClause(layer.config.columns, polygon)
    }
    return null
  }).filter(Boolean)
  return clauses.length ? clauses.reduce((left, right) => and(left, right)) : null
}
