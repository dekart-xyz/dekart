import { describe, expect, it } from 'vitest'
import keplerGlReducer, { createNewDatasetSuccessUpdater } from '@kepler.gl/reducers'
import { createNewDatasetSuccess, createOrUpdateFilter, registerEntry, removeFilter, setFilter, wrapTo } from '@kepler.gl/actions'
import { processRowObject } from '@kepler.gl/processors'
import { KeplerTable } from '@kepler.gl/table'
import { Selection } from '@uwdata/mosaic-core'
import { Toggle, Interval1D } from '@uwdata/mosaic-plot'
import { createStore } from 'redux'
import type { AnyAction } from 'redux'
import type { KeplerGlState } from '@kepler.gl/reducers'
import { createKeplerMosaicFilterSync } from './index'
import type { Binding, CurrentFilterInputs, FilterSync } from './index'

interface Fixture {
  sync: FilterSync
  selection: Selection
  category: Toggle
  range: Interval1D
  bindings: Binding[]
  filters: () => KeplerGlState['visState']['filters']
  flush: () => Promise<void>
  queue: Array<{ apply: () => boolean, cancelled: boolean }>
  errors: string[]
  command: (action: Parameters<typeof wrapTo>[1]) => void
  readonly projected: number
  readonly edits: number
  setReady: (value: boolean) => void
  setEditing: (value: boolean) => void
  setBindings: (value: Binding[] | undefined) => void
  setMalformed: (value: boolean) => void
  setMissingName: (value: boolean) => void
  setSpatial: (value: boolean, boundType?: string, otherType?: string, centroids?: number[][]) => void
  setDispatchFails: (value: boolean) => void
}

// Run commands through a real Kepler reducer and let the test control presentation order.
async function setup (): Promise<Fixture> {
  const reducer = keplerGlReducer.plugin((state: KeplerGlState, action: AnyAction) => action.type === 'fixture/table'
    ? { ...state, visState: createNewDatasetSuccessUpdater(state.visState, createNewDatasetSuccess({ results: [{ status: 'fulfilled', value: action.table }], addToMapOptions: { autoCreateLayers: false } })) }
    : state)
  const store = createStore(reducer)
  store.dispatch(registerEntry({ id: 'map' }))
  const rows = processRowObject([{ category: 'Alpha', score: 10 }, { category: 'Beta', score: 20 }])
  if (rows == null) throw new Error('Invalid test rows')
  const table = new KeplerTable({ info: { id: 'a', label: 'a' }, color: [1, 2, 3] })
  await table.importData({ data: rows })
  const fixtureAction = { type: 'fixture/table', table }
  store.dispatch(wrapTo('map', fixtureAction as Parameters<typeof wrapTo>[1]))
  const selection = Selection.crossfilter()
  const mark = (field: string): { plot: { markSet: Set<object> }, channelField: () => { field: string, as: string } } => {
    const item = { plot: { markSet: new Set<object>() }, channelField: () => ({ field, as: field }) }
    item.plot.markSet.add(item)
    return item
  }
  const category = new Toggle(mark('category'), { selection, channels: ['x'] })
  const range = new Interval1D(mark('score'), { selection, channel: 'x', field: 'score', brush: undefined })
  const bindings: Binding[] = [
    { filterId: 'widget:category', field: 'category', categorical: true, clients: [category] },
    { filterId: 'widget:score', field: 'score', categorical: false, clients: [range] }
  ]
  const queue: Array<{ apply: () => boolean, cancelled: boolean }> = []
  const errors: string[] = []
  let projected = 0
  let edits = 0
  let ready = true
  let editing = false
  let malformed = false
  let missingName = false
  let spatial = false
  let dispatchFails = false
  let boundType = 'VARCHAR'
  let otherType = 'INTEGER'
  let centroids = [[1, 2]]
  let currentBindings: Binding[] | undefined = bindings
  const state = (): KeplerGlState['visState'] => (store.getState() as Record<'map', KeplerGlState>).map.visState
  const filters = (): KeplerGlState['visState']['filters'] => state().filters
  const input = (): CurrentFilterInputs => ({
    ready,
    editing,
    bindings: currentBindings,
    table: state().datasets.a,
    filters: filters().map(filter => {
      if (missingName) return { ...filter, name: undefined }
      if (malformed) return { ...filter, type: 'timeRange', value: [1, 2] }
      if (spatial) return { ...filter, type: 'polygon', layerId: ['geo'], value: { id: 'area', geometry: { type: 'Polygon', coordinates: [[[0, 0], [3, 0], [0, 3], [0, 0]]] } } }
      return filter
    }) as unknown as CurrentFilterInputs['filters'],
    layers: (spatial
      ? [{ id: 'geo', type: 'geojson', config: { dataId: 'a', columnMode: 'geojson', columns: { geojson: { value: 'shape', fieldIdx: 0 } } }, centroids }]
      : state().layers) as unknown as CurrentFilterInputs['layers'],
    columnTypes: spatial ? { shape: boundType, other: otherType } : {}
  })
  const sync = createKeplerMosaicFilterSync({
    dataId: 'a',
    selection,
    ownedFilterPrefix: 'widget:',
    current: input,
    dispatch: action => { if (dispatchFails) throw new Error('rejected'); store.dispatch(wrapTo('map', action)) },
    defer: apply => { const task = { apply, cancelled: false }; queue.push(task); return () => { task.cancelled = true } },
    onUserEdit: () => { edits++ },
    onProjected: () => { projected++ },
    onError: message => { errors.push(message) }
  })
  const flush = async (): Promise<void> => {
    await selection.pending('value')
    await selection.pending('value')
    for (const task of queue.splice(0)) if (!task.cancelled) task.apply()
    await selection.pending('value')
    await selection.pending('value')
  }
  const command = (action: Parameters<typeof wrapTo>[1]): void => { store.dispatch(wrapTo('map', action)) }
  return {
    sync,
    selection,
    category,
    range,
    bindings,
    filters,
    flush,
    queue,
    errors,
    command,
    get projected () { return projected },
    get edits () { return edits },
    setReady: (value: boolean) => { ready = value },
    setEditing: (value: boolean) => { editing = value },
    setBindings: (value: Binding[] | undefined) => { currentBindings = value },
    setMalformed: (value: boolean) => { malformed = value },
    setMissingName: (value: boolean) => { missingName = value },
    setSpatial: (value: boolean, nextBoundType = boundType, nextOtherType = otherType, nextCentroids = centroids) => {
      spatial = value; boundType = nextBoundType; otherType = nextOtherType; centroids = nextCentroids
    },
    setDispatchFails: (value: boolean) => { dispatchFails = value }
  }
}

describe('Kepler and Mosaic filter sync', () => {
  it('projects a categorical filter, skips display-only edits, and clears a removed filter', async () => {
    const f = await setup()
    f.command(createOrUpdateFilter('widget:category', 'a', 'category', ['Alpha']))
    f.sync.reconcile(); await f.flush()
    expect(f.category.value).toEqual([['Alpha']])
    expect(f.selection.clauses.find(clause => clause.source === f.category)?.predicate).toBeTruthy()
    expect(f.projected).toBe(1)
    f.sync.reconcile()
    expect(f.queue).toHaveLength(0)
    f.command(setFilter(0, 'enlarged', true))
    f.sync.reconcile()
    expect(f.queue).toHaveLength(0)
    f.command(removeFilter(0))
    f.sync.reconcile(); await f.flush()
    expect(f.category.value).toBeNull()
    expect(f.selection.clauses.find(clause => clause.source === f.category)).toBeUndefined()
    f.sync.dispose()
  })

  it('accepts a category click and resets through current Kepler state', async () => {
    const f = await setup()
    f.sync.reconcile(); await f.flush()
    f.setEditing(true)
    f.category.value = [['Beta']]
    f.selection.update(f.category.clause(f.category.value))
    await f.flush()
    expect(f.filters().find(filter => filter.id === 'widget:category')?.value).toEqual(['Beta'])
    expect(f.edits).toBe(1)
    f.sync.reconcile(); await f.flush()
    f.category.value = null
    f.selection.update(f.category.clause(null))
    await f.flush()
    expect(f.filters()).toHaveLength(0)
    f.sync.dispose()
  })

  it('rolls back a queued brush after its binding changes', async () => {
    const f = await setup()
    f.command(createOrUpdateFilter('widget:score', 'a', 'score', [10, 20]))
    f.sync.reconcile(); await f.flush()
    f.range.value = [11, 12]
    f.selection.update(f.range.clause(f.range.value))
    f.setBindings([f.bindings[0], { ...f.bindings[1], field: 'other' }])
    await f.flush(); await f.flush()
    expect(f.filters().find(filter => filter.id === 'widget:score')?.value).toEqual([10, 20])
    expect(f.range.value).toEqual([10, 20])
    f.sync.dispose()
  })

  it('prunes only local owned orphans and waits while bindings are unavailable', async () => {
    const f = await setup()
    f.command(createOrUpdateFilter('widget:deleted', 'a', 'category', ['Alpha']))
    f.command(createOrUpdateFilter('native', 'a', 'category', ['Beta']))
    f.setBindings(undefined)
    f.sync.reconcile()
    expect(f.filters()).toHaveLength(2)
    f.setBindings(f.bindings)
    f.sync.reconcile(); await f.flush()
    expect(f.filters().map(filter => filter.id)).toEqual(['native'])
    f.sync.dispose()
  })

  it('leaves existing clauses in place on derivation error and retries later', async () => {
    const f = await setup()
    f.command(createOrUpdateFilter('widget:category', 'a', 'category', ['Alpha']))
    f.sync.reconcile(); await f.flush()
    const before = f.selection.clauses.find(clause => clause.source === f.category)
    f.setMalformed(true)
    f.sync.reconcile(); await f.flush()
    expect(f.errors.at(-1)).toBe('Could not apply map filters.')
    expect(f.selection.clauses.find(clause => clause.source === f.category)).toBe(before)
    f.setMalformed(false)
    f.sync.reconcile(); await f.flush()
    expect(f.errors.at(-1)).toBe('')
    f.sync.dispose()
  })

  it('cancels pending work and resets the selection on repeated disposal', async () => {
    const f = await setup()
    f.command(createOrUpdateFilter('widget:score', 'a', 'score', [10, 20]))
    f.sync.reconcile()
    f.sync.dispose(); f.sync.dispose(); await f.flush()
    expect(f.selection.clauses).toHaveLength(0)
    expect(f.projected).toBe(0)
  })

  it('keeps separate clauses for native and owned filters on one field', async () => {
    const f = await setup()
    f.command(createOrUpdateFilter('native', 'a', 'category', ['Alpha']))
    f.command(createOrUpdateFilter('widget:category', 'a', 'category', ['Beta']))
    f.sync.reconcile(); await f.flush()
    const clauses = f.selection.clauses.filter(clause => clause.predicate != null)
    expect(clauses).toHaveLength(2)
    expect(new Set(clauses.map(clause => clause.source)).size).toBe(2)
    expect(clauses.every(clause => clause.clients?.has(f.category.mark))).toBe(true)
    f.sync.dispose()
  })

  it('applies the latest of two rapid clicks and ignores unknown sources', async () => {
    const f = await setup()
    f.sync.reconcile(); await f.flush()
    f.category.value = [['Alpha']]
    f.selection.update(f.category.clause(f.category.value))
    await f.selection.pending('value')
    f.category.value = [['Beta']]
    f.selection.update(f.category.clause(f.category.value))
    await f.flush()
    expect(f.filters().find(filter => filter.id === 'widget:category')?.value).toEqual(['Beta'])
    f.selection.update({ source: {}, value: ['Alpha'], predicate: f.category.clause([['Alpha']]).predicate })
    await f.flush()
    expect(f.filters().find(filter => filter.id === 'widget:category')?.value).toEqual(['Beta'])
    f.sync.dispose()
  })

  it('ignores interactions while loading and retries the latest ready state', async () => {
    const f = await setup()
    f.setReady(false)
    f.sync.reconcile()
    expect(f.queue).toHaveLength(0)
    f.category.value = [['Alpha']]
    f.selection.update(f.category.clause(f.category.value))
    await f.flush()
    expect(f.filters()).toHaveLength(0)
    f.setReady(true)
    f.sync.reconcile(); await f.flush()
    expect(f.category.value).toBeNull()
    f.sync.dispose()
  })

  it('reports a malformed restored binding before scheduling and keeps the old clause', async () => {
    const f = await setup()
    f.command(createOrUpdateFilter('widget:category', 'a', 'category', ['Alpha']))
    f.sync.reconcile(); await f.flush()
    const before = f.selection.clauses.find(clause => clause.source === f.category)
    f.setMissingName(true)
    f.sync.reconcile()
    expect(f.errors.at(-1)).toBe('Could not apply map filters.')
    expect(f.queue).toHaveLength(0)
    expect(f.selection.clauses.find(clause => clause.source === f.category)).toBe(before)
    f.setMissingName(false)
    f.sync.reconcile(); await f.flush()
    expect(f.errors.at(-1)).toBe('')
    f.sync.dispose()
  })

  it('tracks only bound spatial column type and geometry inputs', async () => {
    const f = await setup()
    f.command(createOrUpdateFilter('native', 'a', 'category', ['Alpha']))
    f.setSpatial(true)
    f.sync.reconcile(); await f.flush()
    expect(f.projected).toBe(1)
    f.setSpatial(true, 'VARCHAR', 'BIGINT')
    f.sync.reconcile()
    expect(f.queue).toHaveLength(0)
    f.setSpatial(true, 'GEOMETRY')
    f.sync.reconcile(); await f.flush()
    expect(f.projected).toBe(2)
    f.setSpatial(true, 'GEOMETRY', 'BIGINT', [[3, 4]])
    f.sync.reconcile(); await f.flush()
    expect(f.projected).toBe(3)
    f.sync.dispose()
  })

  it('clears a replaced interaction handler before using the new one', async () => {
    const f = await setup()
    f.command(createOrUpdateFilter('widget:category', 'a', 'category', ['Alpha']))
    f.sync.reconcile(); await f.flush()
    const replacement = new Toggle({ plot: { markSet: new Set<object>() }, channelField: () => ({ field: 'category', as: 'category' }) }, { selection: f.selection, channels: ['x'] })
    f.setBindings([{ ...f.bindings[0], clients: [replacement] }, f.bindings[1]])
    f.sync.reconcile(); await f.flush()
    expect(f.selection.clauses.some(clause => clause.source === f.category)).toBe(false)
    expect(f.selection.clauses.find(clause => clause.source === replacement)?.predicate).toBeTruthy()
    expect(replacement.value).toEqual([['Alpha']])
    f.sync.dispose()
  })

  it('clears a disabled filter and reenables it from a chart click', async () => {
    const f = await setup()
    f.command(createOrUpdateFilter('widget:category', 'a', 'category', ['Alpha']))
    f.command(setFilter(0, 'enabled', false))
    f.sync.reconcile(); await f.flush()
    expect(f.category.value).toBeNull()
    f.category.value = [['Beta']]
    f.selection.update(f.category.clause(f.category.value))
    await f.flush()
    expect(f.filters()[0].enabled).toBe(true)
    expect(f.filters()[0].value).toEqual(['Beta'])
    f.sync.dispose()
  })

  it('rolls back an unchanged chart selection without dispatching', async () => {
    const f = await setup()
    f.command(createOrUpdateFilter('widget:category', 'a', 'category', ['Alpha']))
    f.sync.reconcile(); await f.flush()
    const before = f.filters()[0]
    f.category.value = [['Alpha']]
    f.selection.update(f.category.clause(f.category.value))
    await f.flush(); await f.flush()
    expect(f.filters()[0]).toBe(before)
    expect(f.category.value).toEqual([['Alpha']])
    expect(f.projected).toBe(2)
    f.sync.dispose()
  })

  it('applies a queued click over the latest Kepler edit', async () => {
    const f = await setup()
    f.command(createOrUpdateFilter('widget:category', 'a', 'category', ['Alpha']))
    f.sync.reconcile(); await f.flush()
    f.category.value = [['Gamma']]
    f.selection.update(f.category.clause(f.category.value))
    await f.selection.pending('value')
    f.command(setFilter(0, 'value', ['Beta']))
    await f.flush()
    expect(f.filters()[0].value).toEqual(['Gamma'])
    f.sync.reconcile(); await f.flush()
    expect(f.category.value).toEqual([['Gamma']])
    f.sync.dispose()
  })

  it('keeps an owned filter active until its chart handler is registered', async () => {
    const f = await setup()
    f.setBindings([{ ...f.bindings[0], clients: [] }, f.bindings[1]])
    f.command(createOrUpdateFilter('widget:category', 'a', 'category', ['Alpha']))
    f.sync.reconcile(); await f.flush()
    const fallbackClause = f.selection.clauses.find(clause => clause.predicate != null)
    expect(fallbackClause?.source).not.toBe(f.category)
    f.setBindings(f.bindings)
    f.sync.reconcile(); await f.flush()
    expect(f.selection.clauses.some(clause => clause.source === fallbackClause?.source)).toBe(false)
    expect(f.selection.clauses.find(clause => clause.source === f.category)?.predicate).toBeTruthy()
    f.sync.dispose()
  })

  it('reports a failed command and returns the chart to Kepler state', async () => {
    const f = await setup()
    f.command(createOrUpdateFilter('widget:category', 'a', 'category', ['Alpha']))
    f.sync.reconcile(); await f.flush()
    f.setDispatchFails(true)
    f.category.value = [['Beta']]
    f.selection.update(f.category.clause(f.category.value))
    await f.flush(); await f.flush()
    expect(f.filters()[0].value).toEqual(['Alpha'])
    expect(f.category.value).toEqual([['Alpha']])
    expect(f.errors).toContain('Could not apply map filters.')
    f.sync.dispose()
  })
})
