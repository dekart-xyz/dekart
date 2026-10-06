import { resolveFilterBindings } from '../dark/kepler-filter-bindings/index'

// SQLRooms exposes DuckDB column types; the binding resolver receives Kepler field types.
export function keplerFieldType (type) {
  const value = type?.toLowerCase()
  if (['tinyint', 'smallint', 'integer', 'bigint', 'hugeint', 'utinyint', 'usmallint', 'uinteger', 'ubigint'].includes(value)) return 'integer'
  if (['real', 'float', 'double', 'decimal'].includes(value)) return 'real'
  if (['varchar', 'text', 'string'].includes(value)) return 'string'
  if (value === 'date' || value === 'timestamp' || value === 'boolean') return value
  return type
}

// Saved widget pairs remain effective only while their field classes still match.
export function compatibleWidgetFilter (filter, dataId, datasets) {
  if (!filter.id.startsWith('widget:')) return true
  const tables = Object.values(datasets).map(table => ({
    dataId: table.id,
    fields: table.fields.map(field => ({ name: field.name, type: field.type }))
  }))
  const pairs = filter.dataId.map((id, index) => ({ dataId: id, field: filter.name[index] }))
  return resolveFilterBindings({
    tables,
    primaryDataId: filter.dataId[0],
    field: filter.name[0],
    crossFilter: false,
    currentBindings: pairs
  }).compatibleDataIds.includes(dataId)
}
