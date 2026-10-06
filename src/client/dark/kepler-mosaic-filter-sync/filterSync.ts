import { createOrUpdateFilter, removeFilter, setFilter } from '@kepler.gl/actions'
import { getFilterRecord } from '@kepler.gl/utils'
import type { SelectionClause } from '@uwdata/mosaic-core'
import { deriveFilterClauses } from '../kepler-filter-to-sql/index'
import type { Filter, LayerBinding } from '../kepler-filter-to-sql/index'
import { resolveFilterBindings } from '../kepler-filter-bindings/index'
import type { BindingTable } from '../kepler-filter-bindings/index'

/** A filter with the field index used by Kepler's CPU predicates. */
export interface KeplerFilter extends Filter {
  /** Field positions for each entry in dataId. */
  fieldIdx?: number[]
  /** Other Kepler filter properties passed through without interpretation. */
  [key: string]: unknown
}
/** A layer with the spatial and display properties read by Kepler. */
export interface KeplerLayer extends LayerBinding {
  /** Layer centroids used by Kepler's spatial predicate. */
  centroids?: unknown
  /** Feature data that may supply centroids when the layer does not. */
  dataToFeature?: {
    /** Centroids associated with the layer's features. */
    centroids?: unknown
  }
}
/** A chart interaction handler that owns a selection clause and displayed value. */
export interface MosaicClient {
  /** Selection this handler belongs to, when registered. */
  selection?: MosaicSelection
  /** Value currently displayed by the handler. */
  value: unknown
  /** Build this handler's selection clause for a value. */
  clause: (value: unknown) => SelectionClause
}
/** The event and clause operations needed from one Mosaic selection. */
export interface MosaicSelection {
  /** Most recent selection clause. */
  readonly active: SelectionClause
  /** Add or replace the clause for its source. */
  update: (clause: SelectionClause) => unknown
  /** Clear this selection's clauses. */
  reset: () => unknown
  /** Observe selection value changes. */
  addEventListener: (type: string, callback: () => void) => void
  /** Stop observing selection value changes. */
  removeEventListener: (type: string, callback: () => void) => void
}
/** One chart's filter identity, current field and registered interaction handlers. */
export interface Binding {
  /** Stable ID of the filter controlled by this chart. */
  filterId: string
  /** Field selected for this chart's filter. */
  field: string
  /** Whether chart values are category lists rather than numeric ranges. */
  categorical: boolean
  /** Whether the current selection also binds matching loaded tables. */
  crossFilter: boolean
  /** Interaction handlers registered for this chart. */
  clients: readonly MosaicClient[]
}
/** Live inputs. Undefined bindings or table, or false ready, postpone reconciliation. */
export interface CurrentFilterInputs {
  /** Whether reconciliation may proceed; false postpones it. */
  ready: boolean
  /** Whether a user edit should be reported through onUserEdit. */
  editing: boolean
  /** Current Kepler table; absence postpones reconciliation. */
  table?: {
    /** Table binding ID, matched against filter dataId entries. */
    id: string
    /** Data source used by Kepler's CPU filter predicates. */
    dataContainer: {
      /** Current row count, used to detect changes to CPU filter inputs. */
      numRows: () => number
    }
    /** Field metadata indexed by each filter's fieldIdx entry. */
    fields: ReadonlyArray<{ valueAccessor?: unknown, format?: unknown, filterProps?: { mappedValue?: unknown } }>
  }
  /** Current Kepler filters, including filters outside this binding. */
  filters: readonly KeplerFilter[]
  /** Current layers used to resolve spatial filters. */
  layers: readonly KeplerLayer[]
  /** Column types by name for spatial filter derivation. */
  columnTypes: Readonly<Record<string, string>>
  /** Current chart bindings; absence postpones reconciliation. */
  bindings?: readonly Binding[]
  /** Current fields in all loaded tables, used to find matching filter targets. */
  tables: readonly BindingTable[]
}
/** Injected state, scheduling and feedback for one selection and data binding. */
export interface Options {
  /** ID of the data binding whose filters are reconciled. */
  dataId: string
  /** Selection to update from Kepler filters and observe for user edits. */
  selection: MosaicSelection
  /** Prefix identifying filters this controller may remove when their bindings disappear. */
  ownedFilterPrefix: string
  /** Read the latest filter, binding, and editing state whenever reconciliation runs. */
  current: () => CurrentFilterInputs
  /** Apply a Kepler filter action to the authoritative state. */
  dispatch: (action: ReturnType<typeof removeFilter> | ReturnType<typeof setFilter> | ReturnType<typeof createOrUpdateFilter>) => void
  /**
   * Let the chart UI show pending feedback before running apply, which may
   * trigger synchronous Kepler CPU filtering. Return a cancellation function.
   * If apply returns true, wait for the changed map to render before finishing;
   * false means no map change needs to render.
   */
  defer: (apply: () => boolean) => () => void
  /** Called when an interaction or binding reconciliation changes a Kepler filter. */
  onUserEdit: () => void
  /** Called after Kepler filters have been projected into the selection. */
  onProjected: () => void
  /** Receives an error message, or an empty string after successful projection. */
  onError: (message: string) => void
}
/** Reconcile current bindings and chart clauses or release the selection. Both methods are safe to repeat. */
export interface FilterSync {
  /** Apply current filter settings, then project Kepler filters into Mosaic. */
  reconcile: () => void
  /** Cancel pending work, remove the selection listener, and clear the selection. */
  dispose: () => void
}

type Source = SelectionClause['source']
interface Intent { source: Source, filterId: string, field: string, editing: boolean, value: unknown }
const errorMessage = 'Could not apply map filters.'

// Snapshot only predicate inputs: display edits and unrelated layers must not re-send clauses.
function nativeFilterInputs (table: NonNullable<CurrentFilterInputs['table']>, filters: readonly KeplerFilter[], layers: readonly KeplerLayer[], columnTypes: CurrentFilterInputs['columnTypes']): unknown[] {
  const inputs: unknown[] = [table.dataContainer, table.dataContainer.numRows()]
  for (const filter of filters) {
    const index = filter.fieldIdx?.[filter.dataId.indexOf(table.id)]
    const field = index === undefined ? undefined : table.fields[index]
    inputs.push(filter.id, filter.type, filter.enabled, index, JSON.stringify(filter.value), field?.valueAccessor, field?.format, JSON.stringify(field?.filterProps?.mappedValue))
    // Polygon predicates also depend on the bound geometry, including in-place layer edits.
    if (filter.type === 'polygon') {
      for (const id of filter.layerId ?? []) {
        const layer = layers.find(layer => layer.id === id && layer.config.dataId === table.id)
        inputs.push(id, layer?.type, layer?.config.dataId, layer?.config.columnMode, layer?.centroids, layer?.dataToFeature?.centroids)
        for (const [name, bound] of Object.entries(layer?.config.columns ?? {})) inputs.push(name, bound?.value, bound?.fieldIdx, bound?.value == null ? undefined : columnTypes[bound.value])
      }
    }
  }
  return inputs
}

// A key keeps values and handler identities, never replaceable filter or binding wrappers.
function projectionKey (input: CurrentFilterInputs, dataId: string): unknown[] {
  const filters = input.filters.filter(filter => filter.dataId.includes(dataId))
  const key: unknown[] = []
  for (const binding of input.bindings ?? []) key.push(binding.filterId, binding.field, binding.categorical, ...binding.clients, binding.clients.length)
  key.push(input.bindings?.length)
  for (const filter of filters) key.push(filter.id, filter.type, filter.enabled, JSON.stringify(filter.value), ...filter.dataId, ...filter.name, filter.dataId.length, filter.name.length)
  for (const table of input.tables) key.push(table.dataId, ...table.fields.flatMap(field => [field.name, field.type]))
  key.push(filters.length)
  if (input.table != null) key.push(...nativeFilterInputs(input.table, filters, input.layers, input.columnTypes))
  return key
}

function sameKey (a: unknown[] | null, b: unknown[]): boolean {
  return a !== null && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
}

function handlerFor (binding: Binding | undefined, selection: MosaicSelection): MosaicClient | undefined {
  return binding?.clients.find(client => client.selection === selection)
}

function chartValue (filter: KeplerFilter | undefined, active: boolean, binding: Binding): unknown {
  if ((filter == null) || !active) return binding.categorical ? null : undefined
  return binding.categorical ? (filter.value as unknown[]).map(value => [value]) : filter.value
}

/**
 * Create one controller for a Mosaic selection. Kepler is authoritative: accepted
 * interactions dispatch over current state; rejected interactions are projected
 * back from it. Derivation errors preserve existing clauses and report a generic
 * error. Call dispose when the selection is no longer owned.
 */
export function createKeplerMosaicFilterSync (options: Options): FilterSync {
  const { dataId, selection } = options
  const authored = new WeakSet<SelectionClause>()
  const sources = new Map<string, Source>()
  const fallback = new Map<string, Source>()
  let appliedKey: unknown[] | null = null
  let cancelUpdate: (() => void) | undefined
  let cancelIntent: (() => void) | undefined
  let disposed = false

  // Change only the pairs that differ; Kepler updates each paired ID/name atomically.
  const applyPairs = (filterId: string, field: string, crossFilter: boolean): boolean => {
    const input = options.current()
    const current = input.filters.find(filter => filter.id === filterId)
    if (current == null || current.dataId[0] !== dataId || current.name[0] !== field) return false
    const desired = resolveFilterBindings({
      tables: input.tables,
      primaryDataId: dataId,
      field,
      crossFilter,
      currentBindings: current.dataId.map((id, index) => ({ dataId: id, field: current.name[index] }))
    }).bindings
    if (desired[0]?.dataId !== dataId || desired[0]?.field !== field) return false
    const same = current.dataId.length === desired.length && desired.every((pair, index) =>
      current.dataId[index] === pair.dataId && current.name[index] === pair.field)
    if (same) return false
    // Remove from the end so earlier pair positions remain stable during Kepler reductions.
    for (let index = current.dataId.length - 1; index > 0; index--) {
      const pair = desired[index]
      if (pair?.dataId === current.dataId[index] && pair.field === current.name[index]) continue
      const liveIndex = options.current().filters.findIndex(filter => filter.id === filterId)
      options.dispatch(setFilter(liveIndex, 'dataId', null, index))
    }
    for (let index = 1; index < desired.length; index++) {
      const liveIndex = options.current().filters.findIndex(filter => filter.id === filterId)
      const live = options.current().filters[liveIndex]
      if (live?.dataId[index] === desired[index].dataId && live.name[index] === desired[index].field) continue
      options.dispatch(setFilter(liveIndex, ['dataId', 'name'], [desired[index].dataId, desired[index].field], index))
    }
    return true
  }

  const update = (clause: SelectionClause): void => {
    authored.add(clause)
    selection.update(clause)
  }

  const reconcile = (): void => {
    if (disposed) return
    const input = options.current()
    if (!input.ready || (input.table == null) || (input.bindings == null)) return
    const owned = new Set(input.bindings.map(binding => binding.filterId))
    // Delete against the latest array because each Kepler dispatch shifts later indices.
    for (const filter of [...input.filters].reverse()) {
      if (filter.id.startsWith(options.ownedFilterPrefix) && filter.dataId[0] === dataId && !owned.has(filter.id)) {
        const index = options.current().filters.findIndex(current => current.id === filter.id)
        if (index >= 0) options.dispatch(removeFilter(index))
      }
    }
    // Only the owner may change a widget filter's primary field or target pairs.
    try {
      for (const binding of input.bindings) {
        const filter = options.current().filters.find(item => item.id === binding.filterId)
        if (filter?.dataId[0] !== dataId) continue
        if (filter.name[0] !== binding.field) {
          const index = options.current().filters.findIndex(item => item.id === binding.filterId)
          options.dispatch(removeFilter(index))
          options.onUserEdit()
        } else if (applyPairs(binding.filterId, binding.field, binding.crossFilter)) options.onUserEdit()
      }
    } catch {
      appliedKey = null
      options.onError(errorMessage)
      return
    }
    let key: unknown[]
    try {
      key = projectionKey(options.current(), dataId)
    } catch {
      appliedKey = null
      options.onError(errorMessage)
      return
    }
    if (sameKey(appliedKey, key)) return
    cancelUpdate?.()
    cancelUpdate = options.defer(() => {
      cancelUpdate = undefined
      if (disposed) return false
      const now = options.current()
      if (!now.ready || (now.table == null) || (now.bindings == null)) return false
      try {
        const currentKey = projectionKey(now, dataId)
        const record = getFilterRecord(dataId, now.filters as Parameters<typeof getFilterRecord>[1], { cpuOnly: true, ignoreDomain: true }).cpu
        const eligible = new Set(record.map(filter => filter.id).filter(id => {
          const filter = now.filters.find(item => item.id === id)
          if (filter == null || !filter.id.startsWith(options.ownedFilterPrefix)) return true
          const pairs = filter.dataId.map((boundId, index) => ({ dataId: boundId, field: filter.name[index] }))
          return resolveFilterBindings({
            tables: now.tables,
            primaryDataId: filter.dataId[0],
            field: filter.name[0],
            crossFilter: false,
            currentBindings: pairs
          }).compatibleDataIds.includes(dataId)
        }))
        const clauses = deriveFilterClauses([...now.filters], dataId, eligible, { layers: now.layers, columnTypes: now.columnTypes })
        const bindings = now.bindings
        const desired = clauses.map(clause => {
          const binding = bindings.find(item => item.filterId === clause.filterId)
          const handler = handlerFor(binding, selection)
          const filter = now.filters.find(item => item.id === clause.filterId)
          const clients = new Set(bindings.filter(item => item.field === clause.field).flatMap(item => item.clients.filter(client => client.selection === selection).flatMap(client => [...(client.clause(client.value).clients ?? [])])))
          const value = (handler != null) && (binding != null) ? chartValue(filter, Boolean(clause.sqlCondition), binding) : (clause.sqlCondition != null) ? 'Map filter' : null
          let source = fallback.get(clause.filterId)
          if (source == null) { source = {}; fallback.set(clause.filterId, source) }
          return { id: clause.filterId, source: handler ?? source, handler, value, clients, predicate: clause.sqlCondition }
        })
        const active = new Set(desired.map(item => item.id))
        for (const item of desired) {
          const old = sources.get(item.id)
          if ((old != null) && old !== item.source) update({ source: old, value: null, predicate: null })
          sources.set(item.id, item.source)
          if (item.handler != null) item.handler.value = item.value
          update({ source: item.source, clients: item.clients, value: item.value, predicate: item.predicate })
        }
        for (const binding of now.bindings) {
          if (active.has(binding.filterId)) continue
          const handler = handlerFor(binding, selection)
          if (handler != null) {
            handler.value = binding.categorical ? null : undefined
            update({ source: handler, value: handler.value, predicate: null })
          }
        }
        for (const [id, source] of sources) {
          if (active.has(id)) continue
          update({ source, value: null, predicate: null })
          sources.delete(id)
          fallback.delete(id)
        }
        appliedKey = currentKey
        options.onError('')
        options.onProjected()
      } catch {
        appliedKey = null
        options.onError(errorMessage)
      }
      return false
    })
  }

  const onValue = (): void => {
    if (disposed) return
    const clause = selection.active
    if (clause == null || authored.has(clause)) return
    const input = options.current()
    if (!input.ready || (input.bindings == null)) return
    const binding = input.bindings.find(item => item.clients.includes(clause.source as MosaicClient))
    if (binding == null) return
    // A chart can emit an empty predicate while rebuilding after a source change.
    // A user clearing the last category emits a null predicate instead.
    if (binding.categorical && clause.predicate != null && Array.isArray(clause.value) && clause.value.flat().length === 0) return
    const value = (clause.predicate != null) ? binding.categorical ? (clause.value as unknown[]).flat() : clause.value : null
    const intent: Intent = { source: clause.source, filterId: binding.filterId, field: binding.field, editing: input.editing, value }
    appliedKey = null
    cancelIntent?.()
    cancelIntent = options.defer(() => {
      cancelIntent = undefined
      if (disposed) return false
      const now = options.current()
      const currentBinding = now.bindings?.find(item => item.filterId === intent.filterId)
      if (!now.ready || (currentBinding == null) || currentBinding.field !== intent.field || handlerFor(currentBinding, selection) !== intent.source || now.editing !== intent.editing) {
        reconcile()
        return false
      }
      const index = now.filters.findIndex(filter => filter.id === intent.filterId)
      const existing = now.filters[index]
      let changed = false
      let failed = false
      try {
        if (intent.value === null) {
          if (existing != null && existing.enabled !== false) { options.dispatch(removeFilter(index)); changed = true }
        } else {
          if (existing?.enabled === false) { options.dispatch(setFilter(index, 'enabled', true)); changed = true }
          if (existing == null || existing.dataId[0] !== dataId || existing.name[0] !== currentBinding.field || JSON.stringify(existing.value) !== JSON.stringify(intent.value)) {
            if (existing?.dataId[0] === dataId && existing.name[0] === currentBinding.field) options.dispatch(setFilter(index, 'value', intent.value))
            else options.dispatch(createOrUpdateFilter(intent.filterId, dataId, currentBinding.field, intent.value))
            changed = true
          }
        }
        if (changed && intent.editing) options.onUserEdit()
      } catch {
        failed = true
        options.onError(errorMessage)
      }
      if (!changed || failed) reconcile()
      return changed && !failed
    })
  }
  selection.addEventListener('value', onValue)
  return {
    reconcile,
    dispose: () => {
      if (disposed) return
      disposed = true
      cancelUpdate?.()
      cancelIntent?.()
      selection.removeEventListener('value', onValue)
      selection.reset()
    }
  }
}
