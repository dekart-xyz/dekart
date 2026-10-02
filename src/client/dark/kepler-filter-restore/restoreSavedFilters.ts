import { addFilter, createOrUpdateFilter, setFilter } from '@kepler.gl/actions'
import { visStateReducer } from '@kepler.gl/reducers'
import type { KeplerGlState } from '@kepler.gl/reducers'
import type { Filter } from '@kepler.gl/types'
import type { AnyAction, Reducer } from 'redux'

type VisState = KeplerGlState['visState']
export type SavedFilter = Pick<Filter, 'id' | 'type' | 'dataId' | 'name' | 'value'> & { enabled?: boolean, layerId?: string[] }
// The SDK reducer declaration incorrectly types actions as VisState.
const reduce = visStateReducer as unknown as Reducer<VisState, AnyAction>

// Apply real Kepler updaters so filtered indices and layers follow restored values.
export function restoreSavedFilters (state: VisState, saved: SavedFilter[]): { state: VisState, pending: SavedFilter[] } {
  const pending: SavedFilter[] = []
  for (const filter of saved) {
    // A missing primary table cannot be restored yet.
    if (state.datasets[filter.dataId[0]] === undefined) {
      pending.push(filter)
      continue
    }
    const missing = !state.filters.some(live => live.id === filter.id)
    if (missing) {
      state = reduce(state, filter.type === 'polygon'
        ? addFilter(filter.dataId[0], filter.id)
        : createOrUpdateFilter(filter.id, filter.dataId[0], filter.name[0], filter.value))
      // Kepler can reject a field binding; keep the record for a subsequent publication.
      if (!state.filters.some(live => live.id === filter.id)) {
        pending.push(filter)
        continue
      }
      state = updateFilter(state, filter.id, 'type', filter.type)
      if (filter.type === 'polygon') state = updateFilter(state, filter.id, 'layerId', filter.layerId ?? [])
      filter.dataId.slice(1).forEach((id, index) => {
        // Preserve ID/field pairs only for secondary tables still present.
        if (state.datasets[id] !== undefined) {
          state = updateFilter(state, filter.id,
            ['dataId', 'name'], [id, filter.name[index + 1]], state.filters.find(live => live.id === filter.id)?.dataId.length)
        }
      })
    }
    const live = state.filters.find(live => live.id === filter.id) as Filter
    // Data replacement can clear or clamp an authored selection without an explicit edit.
    if (JSON.stringify(live.value) !== JSON.stringify(filter.value)) state = updateFilter(state, filter.id, 'value', filter.value)
    if ((live.enabled) !== (filter.enabled !== false)) state = updateFilter(state, filter.id, 'enabled', filter.enabled !== false)
  }
  return { state, pending }
}

// Re-resolve the index after every updater because Kepler may rebuild its filter array.
function updateFilter (state: VisState, id: string, prop: string | string[], value: unknown, valueIndex?: number): VisState {
  return reduce(state, setFilter(state.filters.findIndex(filter => filter.id === id), prop, value, valueIndex))
}
