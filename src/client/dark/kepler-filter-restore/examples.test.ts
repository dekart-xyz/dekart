import { describe, expect, it } from 'vitest'
import keplerGlReducer, { visStateReducer, createNewDatasetSuccessUpdater, prepareStateForDatasetReplace } from '@kepler.gl/reducers'
import { createNewDatasetSuccess, createOrUpdateFilter, setFilter, removeFilter, toggleFilterFeature, wrapTo, registerEntry, deleteEntry, removeDataset, updateMap, addLayer, setPolygonFilterLayer } from '@kepler.gl/actions'
import { processRowObject } from '@kepler.gl/processors'
import { KeplerTable } from '@kepler.gl/table'
import { createStore, combineReducers } from 'redux'
import type { AnyAction, Reducer, Dispatch, Store } from 'redux'
import type { KeplerGlState } from '@kepler.gl/reducers'
import { KeplerGlSchema } from '@kepler.gl/schemas'
import type { FilterRestore, KeplerState } from './index'
import { createFilterRestore } from './index'
// Use real Kepler state and tables; fixture commands model automatic publication.
function fixtureReducer (state: KeplerGlState, action: AnyAction): KeplerGlState {
  if (action.type === 'kepler-filter-restore/fixture-replace') {
    const prepared = Object.hasOwn(state.visState.datasets, action.table.id)
      ? prepareStateForDatasetReplace(state.visState, action.table.id, action.table.id)
      : state.visState
    return {
      ...state,
      visState: createNewDatasetSuccessUpdater(prepared,
        createNewDatasetSuccess({
          results: [{ status: 'fulfilled', value: action.table }],
          addToMapOptions: { autoCreateLayers: false }
        }))
    }
  }
  if (action.type === 'kepler-filter-restore/fixture-automatic') {
    return { ...state, visState: (visStateReducer as unknown as Reducer<KeplerGlState['visState'], AnyAction>)(state.visState, action.action) }
  }
  return state
}

// Mount the wrapped real reducer at an arbitrary Redux key.
interface Fixture {
  recovery: FilterRestore
  context: { getFilters: () => KeplerGlState['visState']['filters'], dispatch: Dispatch<AnyAction> }
  publish: (dataId: string, empty?: boolean) => Promise<void>
  automatic: (action: AnyAction) => void
  dropFilter: () => void
  store: Store<Record<string, KeplerState>, AnyAction>
  mount: string
}
async function keplerState (mount = 'maps'): Promise<Fixture> {
  const recovery = createFilterRestore({
    keplerInstanceId: 'map',
    keplerReducer: keplerGlReducer.plugin(fixtureReducer)
  })
  const store = createStore(combineReducers({ [mount]: recovery.reducer }))
  store.dispatch(registerEntry({ id: 'map' }))
  const context = {
    getFilters: () => (store.getState()[mount].map as KeplerGlState).visState.filters,
    dispatch: store.dispatch
  }
  const publish = async (dataId: string, empty = false): Promise<void> => await publishTable(store.dispatch, 'map', dataId, empty)
  const automatic = (action: AnyAction): void => {
    store.dispatch(wrapTo('map', fixtureCommand('kepler-filter-restore/fixture-automatic', { action })))
  }
  await publish('a')
  store.dispatch(wrapTo('map', createOrUpdateFilter('selected', 'a', 'category', ['Alpha'])))
  return { recovery, context, publish, automatic, dropFilter: () => automatic(removeFilter(0)), store, mount }
}

// Publish through real Kepler table import and replacement updaters.
async function publishTable (dispatch: Dispatch<AnyAction>, map: string, dataId: string, empty = false): Promise<void> {
  const source = processRowObject([{ category: 'Alpha', score: 10, latitude: 0, longitude: 0 }, { category: 'Beta', score: 20, latitude: 1, longitude: 1 }])
  if (source === null) throw new Error('Invalid Kepler fixture')
  const table = new KeplerTable({ info: { id: dataId, label: dataId }, color: [1, 2, 3] })
  const data: Parameters<typeof table.importData>[0]['data'] = { ...source, rows: empty ? [] : source.rows }
  await table.importData({ data })
  dispatch(wrapTo(map, fixtureCommand('kepler-filter-restore/fixture-replace', { table })))
}
// The forwarding declaration excludes extension actions accepted by Kepler at runtime.
function fixtureCommand (type: string, payload: Record<string, unknown>): Parameters<typeof wrapTo>[1] {
  return { type, ...payload } as unknown as Parameters<typeof wrapTo>[1]
}

describe('Kepler filter restoration', () => {
  it('restores values cleared by real zero-row replacement', async () => {
    const { recovery, context, publish } = await keplerState()
    context.dispatch(recovery.capture('a'))
    await publish('a', true)
    expect(context.getFilters()[0].value).toEqual([])
    context.dispatch(recovery.capture('a')) // retain the first snapshot
    await publish('a')
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()[0].value).toEqual(['Alpha'])
  })

  it('does not resurrect an explicitly removed filter', async () => {
    const { recovery, context, publish } = await keplerState()
    context.dispatch(recovery.capture('a'))
    await publish('a', true)
    context.dispatch(removeFilter(0))
    await publish('a')
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()).toEqual([])
  })

  it('recreates missing scalar filters with surviving secondary bindings', async () => {
    const { recovery, context, publish, dropFilter, automatic } = await keplerState()
    await publish('b')
    context.dispatch(setFilter(0, ['dataId', 'name'], ['b', 'category'], 1))
    context.dispatch(recovery.capture('a'))
    context.dispatch(recovery.capture('b'))
    const reduced = context.getFilters().slice()
    dropFilter()
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()[0].id).toBe(reduced[0].id)
    expect(context.getFilters()[0].dataId).toEqual(['a', 'b'])
    expect(context.getFilters()[0].name).toEqual(['category', 'category'])
    expect(context.getFilters()[0].value).toEqual(['Alpha'])
    automatic(setFilter(0, 'value', []))
    context.dispatch(recovery.restore('b')) // restoring a did not cancel b's snapshot
    expect(context.getFilters()[0].value).toEqual(['Alpha'])
  })

  it('keeps polygon visibility edits and forwarded scalar commands', async () => {
    const { recovery, context } = await keplerState()
    context.dispatch(setFilter(0, 'type', 'polygon'))
    context.dispatch(setFilter(0, 'value', {
      type: 'Feature',
      properties: { filterId: 'selected', isVisible: true },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
    }))
    context.dispatch(recovery.capture('a'))
    context.dispatch(toggleFilterFeature(0))
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()[0].enabled).toBe(false)
    expect(context.getFilters()[0].value.properties.isVisible).toBe(false)
    context.dispatch(recovery.capture('a'))
    context.dispatch(wrapTo('other', removeFilter(0)))
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()[0].enabled).toBe(false)
  })

  it('restores clamped ranges and enabled state', async () => {
    const { recovery, context, automatic } = await keplerState()
    context.dispatch(createOrUpdateFilter('selected', 'a', 'score', [10, 20]))
    context.dispatch(setFilter(0, 'enabled', false))
    context.dispatch(recovery.capture('a'))
    automatic(setFilter(0, 'value', [12, 18]))
    automatic(setFilter(0, 'enabled', true))
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()[0].value).toEqual([10, 20])
    expect(context.getFilters()[0].enabled).toBe(false)
  })

  it('recreates polygon geometry instead of treating it as a scalar value', async () => {
    const { recovery, context, dropFilter } = await keplerState()
    const geometry = {
      type: 'Feature',
      properties: { filterId: 'selected', isVisible: true },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
    }
    context.dispatch(setFilter(0, 'type', 'polygon'))
    context.dispatch(setFilter(0, 'value', geometry))
    context.dispatch(setFilter(0, 'enabled', false))
    const savedValue = context.getFilters()[0].value
    context.dispatch(recovery.capture('a'))
    dropFilter()
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()[0].type).toBe('polygon')
    expect(context.getFilters()[0].value).toEqual(savedValue)
    expect(context.getFilters()[0].enabled).toBe(false)
  })

  it('supports reset and arbitrary mounting with Redux identity', async () => {
    const { recovery, context, publish, store, mount } = await keplerState('custom')
    context.dispatch(recovery.capture('a'))
    const captured = store.getState()
    context.dispatch({ type: 'kepler-filter-restore/unknown' })
    expect(store.getState()).toBe(captured)
    await publish('a', true)
    context.dispatch(recovery.reset())
    await publish('a')
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()[0].value).toEqual([])
    const reset = store.getState()
    context.dispatch(recovery.reset())
    expect(store.getState()).toBe(reset)
    expect(Object.keys(store.getState()[mount])).toEqual(['map'])
  })

  it('isolates composed wrappers, forwarded edits and exported configuration', async () => {
    const first = createFilterRestore({ keplerInstanceId: 'one', keplerReducer: keplerGlReducer.plugin(fixtureReducer) })
    const second = createFilterRestore({ keplerInstanceId: 'two', keplerReducer: first.reducer })
    const store = createStore(second.reducer)
    for (const map of ['one', 'two']) {
      store.dispatch(registerEntry({ id: map }))
      await publishTable(store.dispatch, map, 'a')
      store.dispatch(wrapTo(map, createOrUpdateFilter('selected', 'a', 'category', ['Alpha'])))
    }
    const before = KeplerGlSchema.getConfigToSave(store.getState().one)
    store.dispatch(first.capture('a'))
    store.dispatch(second.capture('a'))
    expect(KeplerGlSchema.getConfigToSave(store.getState().one)).toEqual(before)
    await publishTable(store.dispatch, 'one', 'a', true)
    await publishTable(store.dispatch, 'two', 'a', true)
    store.dispatch(wrapTo('two', removeFilter(0)))
    await publishTable(store.dispatch, 'one', 'a')
    await publishTable(store.dispatch, 'two', 'a')
    store.dispatch(first.restore('a'))
    store.dispatch(second.restore('a'))
    expect((store.getState().one as KeplerGlState).visState.filters[0].value).toEqual(['Alpha'])
    expect((store.getState().one as KeplerGlState).visState.datasets.a.filteredIndex).toEqual([0])
    expect((store.getState().two as KeplerGlState).visState.filters).toEqual([])
    store.dispatch(first.capture('a'))
    store.dispatch(deleteEntry('one'))
    store.dispatch(registerEntry({ id: 'one' }))
    await publishTable(store.dispatch, 'one', 'a')
    store.dispatch(first.restore('a'))
    expect((store.getState().one as KeplerGlState).visState.filters).toEqual([])
  })
  it('retains unavailable primary bindings across ordinary actions and retry', async () => {
    const { recovery, context, publish, automatic, store } = await keplerState()
    context.dispatch(recovery.capture('a'))
    automatic(removeDataset('a'))
    const pending = store.getState()
    context.dispatch(recovery.restore('a'))
    expect(store.getState()).toBe(pending)
    context.dispatch(updateMap({ latitude: 20, longitude: 30, zoom: 4 }))
    await publish('a')
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()[0].value).toEqual(['Alpha'])
    expect((store.getState().maps.map as KeplerGlState).visState.datasets.a.filteredIndex).toEqual([0])
  })

  it('clears pending recovery without current tables and handles absent startup', async () => {
    const recovery = createFilterRestore({ keplerInstanceId: 'map', keplerReducer: keplerGlReducer })
    const empty = recovery.reducer(undefined, recovery.capture('a'))
    expect(recovery.reducer(empty, recovery.restore('a'))).toBe(empty)
    expect(recovery.reducer(empty, recovery.reset())).toBe(empty)
    const fixture = await keplerState()
    fixture.context.dispatch(fixture.recovery.capture('a'))
    fixture.automatic(removeDataset('a'))
    fixture.context.dispatch(fixture.recovery.reset())
    await fixture.publish('a')
    fixture.context.dispatch(fixture.recovery.restore('a'))
    expect(fixture.context.getFilters()).toEqual([])
  })

  it('respects explicit edits and broadcast removal while recovery is pending', async () => {
    const { recovery, context, publish } = await keplerState()
    context.dispatch(recovery.capture('a'))
    await publish('a', true)
    await publish('a')
    context.dispatch(setFilter(0, 'value', ['Beta']))
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()[0].value).toEqual(['Beta'])
    context.dispatch(recovery.capture('a'))
    context.dispatch(removeFilter(0))
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()).toEqual([])
  })

  it('skips absent secondary bindings without losing their field pairing', async () => {
    const { recovery, context, publish, automatic, dropFilter } = await keplerState()
    await publish('b')
    await publish('c')
    context.dispatch(setFilter(0, ['dataId', 'name'], ['b', 'category'], 1))
    context.dispatch(setFilter(0, ['dataId', 'name'], ['c', 'category'], 2))
    context.dispatch(recovery.capture('a'))
    automatic(removeDataset('b'))
    dropFilter()
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()[0].dataId).toEqual(['a', 'c'])
    expect(context.getFilters()[0].name).toEqual(['category', 'category'])
  })

  it('discards recovery on minted re-registration and binding removal', async () => {
    const { recovery, context, publish, automatic } = await keplerState()
    context.dispatch(recovery.capture('a'))
    automatic(setFilter(0, 'value', ['Beta']))
    context.dispatch(recovery.remove('a'))
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()[0].value).toEqual(['Beta'])
    context.dispatch(recovery.capture('a'))
    context.dispatch(registerEntry({ id: 'map' }))
    await publish('a')
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()).toEqual([])
  })
  it('does not cancel an unrelated range when a category filter is edited', async () => {
    const { recovery, context, automatic } = await keplerState()
    context.dispatch(createOrUpdateFilter('range', 'a', 'score', [10, 20]))
    context.dispatch(recovery.capture('a'))
    automatic(setFilter(1, 'value', [12, 18]))
    context.dispatch(setFilter(0, 'value', ['Beta']))
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters().find(filter => filter.id === 'range')?.value).toEqual([10, 20])
    expect(context.getFilters()[0].value).toEqual(['Beta'])
  })

  it('restores a polygon through real point-layer filtering', async () => {
    const { recovery, context, store, dropFilter } = await keplerState()
    context.dispatch(removeFilter(0))
    context.dispatch(addLayer({
      id: 'points',
      type: 'point',
      config: {
        dataId: 'a', isVisible: true, columns: { lat: 'latitude', lng: 'longitude' }
      }
    }))
    const layer = (store.getState().maps.map as KeplerGlState).visState.layers[0]
    const feature: Parameters<typeof setPolygonFilterLayer>[1] = {
      id: 'rectangle',
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5]]]
      }
    }
    context.dispatch(setPolygonFilterLayer(layer, feature))
    const saved = context.getFilters()[0]
    expect((store.getState().maps.map as KeplerGlState).visState.datasets.a.filteredIndex).toEqual([0])
    context.dispatch(recovery.capture('a'))
    dropFilter()
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()[0].id).toBe(saved.id)
    expect(context.getFilters()[0].layerId).toEqual(['points'])
    expect((store.getState().maps.map as KeplerGlState).visState.datasets.a.filteredIndex).toEqual([0])
  })

  it('consumes empty captures before later authored selections', async () => {
    const { recovery, context, publish } = await keplerState()
    context.dispatch(removeFilter(0))
    context.dispatch(recovery.capture('a'))
    context.dispatch(recovery.restore('a'))
    context.dispatch(createOrUpdateFilter('selected', 'a', 'category', ['Alpha']))
    context.dispatch(recovery.capture('a'))
    await publish('a', true)
    await publish('a')
    context.dispatch(recovery.restore('a'))
    expect(context.getFilters()[0].value).toEqual(['Alpha'])
  })

  it('retains a snapshot when a real polygon updater throws', async () => {
    const { recovery, context, store, publish, dropFilter } = await keplerState()
    context.dispatch(removeFilter(0))
    await publish('a', true)
    context.dispatch(addLayer({
      id: 'points',
      type: 'point',
      config: {
        dataId: 'a', isVisible: true, columns: { lat: 'latitude', lng: 'longitude' }
      }
    }))
    const layer = (store.getState().maps.map as KeplerGlState).visState.layers[0]
    const invalid: Parameters<typeof setPolygonFilterLayer>[1] = {
      id: 'invalid', type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[]] }
    }
    // An empty table has no rows on which to evaluate the malformed geometry.
    context.dispatch(setPolygonFilterLayer(layer, invalid))
    context.dispatch(recovery.capture('a'))
    dropFilter()
    await publish('a')
    const before = store.getState()
    expect(() => context.dispatch(recovery.restore('a'))).toThrow()
    expect(store.getState()).toBe(before)
    expect(() => context.dispatch(recovery.restore('a'))).toThrow()
    context.dispatch(recovery.remove('a'))
    expect(() => context.dispatch(recovery.restore('a'))).not.toThrow()
  })
})
