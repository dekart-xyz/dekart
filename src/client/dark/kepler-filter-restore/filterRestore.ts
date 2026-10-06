import { ActionTypes, _actionFor, wrapTo } from '@kepler.gl/actions'
import type { KeplerGlState } from '@kepler.gl/reducers'
import type { Action, AnyAction, Reducer } from 'redux'
import { restoreSavedFilters } from './restoreSavedFilters'
import type { SavedFilter } from './restoreSavedFilters'

const key = 'kepler-filter-restore/pending'
type Pending = Record<string, SavedFilter[]>
type Instance = Partial<KeplerGlState> & { [key]?: Pending }

/** Kepler's instance map, mounted at any Redux key; recovery metadata belongs to each selected instance. */
export type KeplerState = Record<string, Partial<KeplerGlState>>
/** Plain instance-addressed command; dispatch it without inspecting its private payload. */
export type RecoveryAction = Action<'kepler-filter-restore/capture' | 'kepler-filter-restore/restore' | 'kepler-filter-restore/remove' | 'kepler-filter-restore/reset'>
/** Reducer and commands for one Kepler instance; no middleware or external snapshot storage. */
export interface FilterRestore {
  /** Mount in place of the supplied Kepler root reducer. Preserves normal Kepler commands and Redux identity on no-ops. */
  reducer: Reducer<KeplerState, AnyAction>
  /** Save the first JSON-compatible authored filter records containing this Kepler table binding ID. */
  capture: (dataId: string) => RecoveryAction
  /** Restore pending records using current Kepler tables. Unavailable primary bindings remain pending. Errors propagate without consuming recovery. */
  restore: (dataId: string) => RecoveryAction
  /** Discard recovery for one table binding; unknown IDs are harmless. */
  remove: (dataId: string) => RecoveryAction
  /** Discard all recovery for this instance, including when its current tables are absent. */
  reset: () => RecoveryAction
}

/**
 * Wrap a configured Kepler root reducer for one `keplerInstanceId`. Capture before
 * replacement and restore after publication. Snapshots live in Redux, outside
 * authored map configuration; no mutable closure state is retained. Explicit scalar
 * and polygon edits cancel affected pending records. Forwarded commands affect only
 * their addressed map; unaddressed Kepler commands retain broadcast behavior.
 * Missing filters recover ID, type, geometry and surviving paired field bindings;
 * existing filters recover values and enabled state using real Kepler updaters.
 * Inputs must contain JSON-compatible Kepler values. Validation/updater errors
 * propagate; unavailable primary tables retain records for a later restore.
 * Instance deletion or minted re-registration discards its pending recovery.
 *
 * @example
 * ```ts
 * import keplerGlReducer from '@kepler.gl/reducers'
 * import { createFilterRestore } from './index'
 *
 * const recovery = createFilterRestore({
 *   keplerInstanceId: 'map', keplerReducer: keplerGlReducer
 * })
 * // Mount recovery.reducer; dispatch these around data replacement.
 * const capture = recovery.capture('table-id') // before replacement
 * const restore = recovery.restore('table-id') // after publication
 * ```
 */
export function createFilterRestore (options: {
  keplerInstanceId: string
  keplerReducer: Reducer<KeplerState, AnyAction>
}): FilterRestore {
  const { keplerInstanceId, keplerReducer } = options
  return {
    reducer: (state, action) => reduceRecovery(state, action, keplerInstanceId, keplerReducer),
    capture: dataId => command(keplerInstanceId, 'kepler-filter-restore/capture', dataId),
    restore: dataId => command(keplerInstanceId, 'kepler-filter-restore/restore', dataId),
    remove: dataId => command(keplerInstanceId, 'kepler-filter-restore/remove', dataId),
    reset: () => command(keplerInstanceId, 'kepler-filter-restore/reset')
  }
}

// Kepler's forwarding helper supports extension actions despite its narrower declaration.
function command (id: string, type: RecoveryAction['type'], dataId?: string): RecoveryAction {
  return wrapTo(id, { type, dataId } as unknown as Parameters<typeof _actionFor>[1]) as RecoveryAction
}

// Strip recovery before Kepler combineReducers, then reattach it to the surviving instance.
function reduceRecovery (state: KeplerState | undefined, action: AnyAction, id: string,
  base: Reducer<KeplerState, AnyAction>): KeplerState {
  const previous = state?.[id] as Instance | undefined
  const pending = previous?.[key]
  const { [key]: ignoredPending, ...clean } = previous ?? {}
  const input = pending === undefined ? state : { ...state, [id]: clean }
  const next = base(input, action)
  const instance = next[id] as Instance | undefined
  // Removal and minted registration start a new instance lifetime.
  if (instance === undefined || (action.type === ActionTypes.REGISTER_ENTRY &&
    action.payload.id === id && action.payload.mint !== false)) return next
  const addressed = _actionFor(id, action as Parameters<typeof _actionFor>[1]) as AnyAction
  const result = applyRecovery(instance, addressed, pending, previous?.visState?.filters ?? [])
  const updatedPending = Object.keys(result.pending ?? {}).length === 0 ? undefined : result.pending
  // Reuse the original instance when stripping metadata was the only change.
  const restored = result.instance === clean && updatedPending === pending
    ? previous as Instance
    : updatedPending === undefined ? result.instance : { ...result.instance, [key]: updatedPending }
  if (restored === instance) return next
  if (next === input && restored === previous) return state as KeplerState
  return { ...next, [id]: restored }
}

// Recovery commands operate on one binding; explicit Kepler edits supersede saved records.
function applyRecovery (instance: Instance, action: AnyAction, pending: Pending | undefined,
  previousFilters: SavedFilter[]): { instance: Instance, pending: Pending | undefined } {
  switch (action.type) {
    case 'kepler-filter-restore/capture': {
      if (pending?.[action.dataId] !== undefined || instance.visState === undefined) return { instance, pending }
      const saved = instance.visState.filters.filter(filter => filter.dataId.includes(action.dataId))
        .map(({ id, type, dataId, name, value, enabled, layerId }) => ({ id, type, dataId, name, value, enabled, layerId }))
      return { instance, pending: { ...pending, [action.dataId]: structuredClone(saved) } }
    }
    case 'kepler-filter-restore/restore': {
      if (pending?.[action.dataId] === undefined || instance.visState === undefined) return { instance, pending }
      const restored = restoreSavedFilters(instance.visState, pending[action.dataId])
      const remaining = Object.fromEntries(Object.entries(pending).filter(([id]) => id !== action.dataId))
      if (restored.pending.length > 0) remaining[action.dataId] = restored.pending
      const unchanged = restored.pending.length > 0 && restored.pending.length === pending[action.dataId].length &&
        restored.pending.every((filter, index) => filter === pending[action.dataId][index])
      return { instance: restored.state === instance.visState ? instance : { ...instance, visState: restored.state }, pending: unchanged ? pending : remaining }
    }
    case 'kepler-filter-restore/remove': {
      if (pending?.[action.dataId] === undefined) return { instance, pending }
      const remaining = Object.fromEntries(Object.entries(pending).filter(([id]) => id !== action.dataId))
      return { instance, pending: remaining }
    }
    case 'kepler-filter-restore/reset':
      return { instance, pending: undefined }
    default:
      return { instance, pending: cancelEditedFilters(pending, action, previousFilters, instance.visState?.filters ?? []) }
  }
}

// Include the pre-removal index and polygon changes performed internally by Kepler.
function cancelEditedFilters (pending: Pending | undefined, action: AnyAction,
  before: SavedFilter[], after: SavedFilter[]): Pending | undefined {
  const explicit = [ActionTypes.REMOVE_FILTER, ActionTypes.SET_FILTER, ActionTypes.CREATE_OR_UPDATE_FILTER,
    ActionTypes.SET_FEATURES, ActionTypes.DELETE_FEATURE, ActionTypes.SET_POLYGON_FILTER_LAYER,
    ActionTypes.TOGGLE_FILTER_FEATURE].includes(action.type)
  if (pending === undefined || !explicit) return pending
  const changed = new Set([action.id, before[action.idx]?.id,
    ...before.filter(filter => after.find(current => current.id === filter.id) !== filter).map(filter => filter.id)])
  const remaining = Object.fromEntries(Object.entries(pending).map(([id, saved]) =>
    [id, saved.filter(filter => !changed.has(filter.id))]))
  return Object.entries(pending).every(([id, saved]) => saved.length === remaining[id].length) ? pending : remaining
}
