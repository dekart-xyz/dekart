import { Table, vectorFromArray } from 'apache-arrow'
import {
  castDuckDBTypesForKepler,
  getDuckDBColumnTypesMap,
  KeplerGlDuckDbTable,
  setGeoArrowWKBExtension
} from '@kepler.gl/duckdb'
import { arrowSchemaToFields } from '@kepler.gl/processors'
import { KeplerTable } from '@kepler.gl/table'
import { getApplicationConfig } from '@kepler.gl/utils'
import { getColumnTypes, quoteIdentifier } from './database'

const GEOJSON_GEOMETRY_TYPES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon'
])
const GEOJSON_SAMPLE_SIZE = 50

// isGeoJSONGeometry validates the structural fields used by GeoJSON geometry values.
function isGeoJSONGeometry (geometry) {
  // Geometry collections store child geometries instead of coordinates.
  if (geometry?.type === 'GeometryCollection') {
    return Array.isArray(geometry.geometries)
  }
  return GEOJSON_GEOMETRY_TYPES.has(geometry?.type) && Array.isArray(geometry.coordinates)
}

// isGeoJSONGeometryString distinguishes PostGIS GeoJSON text from ordinary JSON values.
function isGeoJSONGeometryString (value) {
  // Avoid parsing ordinary text columns and WKT/WKB geometry strings.
  if (typeof value !== 'string' || !value.trimStart().startsWith('{')) {
    return false
  }
  try {
    const geoJSON = JSON.parse(value)
    // ST_AsGeoJSON(record) wraps the geometry in a GeoJSON Feature.
    if (geoJSON?.type === 'Feature') {
      return geoJSON.geometry === null || isGeoJSONGeometry(geoJSON.geometry)
    }
    return isGeoJSONGeometry(geoJSON)
  } catch {
    return false
  }
}

// suggestGeoJSONTypes promotes sampled GeoJSON VARCHAR columns through Kepler's existing JSON path.
function suggestGeoJSONTypes (table, typeMap = {}) {
  const suggestions = { ...typeMap }
  table.schema.fields.forEach((field, index) => {
    // Native DuckDB JSON and geometry types already have explicit Kepler handling.
    if (typeMap[field.name] !== 'VARCHAR') {
      return
    }
    const column = table.getChildAt(index)
    let foundGeometry = false
    let sampleCount = 0
    for (let row = 0; row < column.length && sampleCount < GEOJSON_SAMPLE_SIZE; row++) {
      const value = column.get(row)
      // Nulls do not determine the column's semantic type.
      if (value == null) {
        continue
      }
      sampleCount++
      // Every sampled non-null value must be a GeoJSON geometry.
      if (!isGeoJSONGeometryString(value)) {
        return
      }
      foundGeometry = true
    }
    // Kepler already maps the JSON suggestion to its GeoJSON field type.
    if (foundGeometry) {
      suggestions[field.name] = 'JSON'
    }
  })
  return suggestions
}

// compactArrowColumns aligns DuckDB's small chunks into one display batch for Deck.gl.
export function compactArrowColumns (columns) {
  return columns.map(column => column.data.length > 1
    ? vectorFromArray(column.nullCount > 0 ? [...column] : column.toArray(), column.type)
    : column)
}

// DekartDuckDBTable lets Kepler render an existing native table without importing it again.
export class DekartDuckDBTable extends KeplerGlDuckDbTable {
  async importData ({ data }) {
    if (!data.dekartArrowTable && !data.dekartDuckDBTable) {
      return super.importData({ data })
    }
    const { fields, cols } = await this.createTableAndGetArrow(data)
    await KeplerTable.prototype.importData.call(this, {
      data: { fields, cols, rows: [] }
    })
  }

  async createTableAndGetArrow (data) {
    if (data.dekartArrowTable) {
      const compactColumns = compactArrowColumns(
        [...Array(data.dekartArrowTable.numCols).keys()]
          .map(index => data.dekartArrowTable.getChildAt(index))
      )
      return {
        fields: arrowSchemaToFields(
          data.dekartArrowTable,
          suggestGeoJSONTypes(data.dekartArrowTable, data.dekartTypeMap)
        ),
        cols: compactColumns
      }
    }
    if (!data.dekartDuckDBTable) {
      const result = await super.createTableAndGetArrow(data)
      return {
        ...result,
        cols: compactArrowColumns(result.cols)
      }
    }

    const database = getApplicationConfig().database
    const connection = await database.connect()
    try {
      const { schema = 'main', name } = data.dekartDuckDBTable
      const reference = `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`
      const columns = await getColumnTypes(connection, reference)
      const result = await connection.query(castDuckDBTypesForKepler(reference, columns) + ' ORDER BY rowid')
      setGeoArrowWKBExtension(result, columns)
      const compactColumns = compactArrowColumns(
        [...Array(result.numCols).keys()].map(index => result.getChildAt(index))
      )
      // Rebuild one aligned table so field metadata and analyzers match the displayed vectors.
      const compactTable = new Table(Object.fromEntries(
        result.schema.fields.map((field, index) => [field.name, compactColumns[index]])
      ))
      setGeoArrowWKBExtension(compactTable, columns)
      return {
        fields: arrowSchemaToFields(
          compactTable,
          suggestGeoJSONTypes(compactTable, getDuckDBColumnTypesMap(columns))
        ),
        cols: compactColumns
      }
    } finally {
      await connection.close()
    }
  }

  // update refreshes fields as well as vectors when a placeholder or query projection changes.
  async update (data) {
    if (!data.dekartArrowTable && !data.dekartDuckDBTable) {
      return super.update(data)
    }
    await this.importData({ data })
    return this
  }
}
