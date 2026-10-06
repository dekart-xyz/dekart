/** One table ID and field name paired in a filter. */
export interface Binding {
  /** ID of the table containing the bound field. */
  dataId: string
  /** Name of the field in that table. */
  field: string
}
/** Field metadata for a loaded table. */
export interface BindingTable {
  /** ID used to bind filters to this table. */
  dataId: string
  /** Current fields, each with its exact name and type used for compatibility. */
  fields: ReadonlyArray<{
    /** Exact field name. */
    name: string
    /** Field type used to check compatibility. */
    type: string
  }>
}

function fieldClass (type: string): string {
  if (type === 'integer' || type === 'real') return 'number'
  if (type === 'string') return 'text'
  return type
}

/**
 * Find exact-name, compatible targets and validate saved pairs against the
 * primary field's type. Missing primary metadata reports ready=false and leaves
 * saved pairs untouched until the caller can calculate current targets.
 */
export function resolveFilterBindings ({ tables, primaryDataId, field, crossFilter, currentBindings }: {
  /** Loaded tables and their current field names and types. */
  tables: readonly BindingTable[]
  /** Table that owns the selected field. */
  primaryDataId: string
  /** Selected field name in the primary table. */
  field: string
  /** Whether same-name, compatible fields in other tables should be included. */
  crossFilter: boolean
  /** Pairs already present on the filter, used to check compatibility while projecting. */
  currentBindings: readonly Binding[]
}): {
    /** Whether the primary field is available and targets can be calculated. */
    ready: boolean
    /** Other tables with a field of the same name and compatible type. */
    matchingDataIds: readonly string[]
    /** Other tables with a field of the same name but a different type class. */
    skippedDataIds: readonly string[]
    /** Current pairs whose fields have a type compatible with the primary field. */
    compatibleDataIds: readonly string[]
    /** Primary pair followed by matching pairs, or unchanged current pairs while not ready. */
    bindings: readonly Binding[]
  } {
  const primary = tables.find(table => table.dataId === primaryDataId)?.fields.find(item => item.name === field)
  if (primary == null || field === '') {
    return {
      ready: false, matchingDataIds: [], skippedDataIds: [], compatibleDataIds: [], bindings: currentBindings
    }
  }
  const matchingDataIds: string[] = []
  const skippedDataIds: string[] = []
  for (const table of tables) {
    if (table.dataId === primaryDataId) continue
    const match = table.fields.find(item => item.name === field)
    if (match == null) continue
    if (fieldClass(match.type) === fieldClass(primary.type)) matchingDataIds.push(table.dataId)
    else skippedDataIds.push(table.dataId)
  }
  const compatibleDataIds = currentBindings.filter(binding => {
    const bound = tables.find(table => table.dataId === binding.dataId)?.fields.find(item => item.name === binding.field)
    return bound != null && fieldClass(bound.type) === fieldClass(primary.type)
  }).map(binding => binding.dataId)
  return {
    ready: true,
    matchingDataIds,
    skippedDataIds,
    compatibleDataIds,
    bindings: [{ dataId: primaryDataId, field }, ...(crossFilter ? matchingDataIds.map(dataId => ({ dataId, field })) : [])]
  }
}
