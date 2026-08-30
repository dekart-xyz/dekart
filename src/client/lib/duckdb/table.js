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
        fields: arrowSchemaToFields(data.dekartArrowTable, data.dekartTypeMap),
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
      const result = await connection.query(castDuckDBTypesForKepler(reference, columns))
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
        fields: arrowSchemaToFields(compactTable, getDuckDBColumnTypesMap(columns)),
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
