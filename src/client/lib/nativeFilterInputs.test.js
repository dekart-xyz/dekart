import { describe, it, expect } from 'vitest'
import { nativeFilterInputs } from './nativeFilterInputs'

const table = { id: 'a', dataContainer: { numRows: () => 10 }, fields: [{ valueAccessor: () => {}, format: 'x' }] }
const range = { id: 'range', type: 'range', dataId: ['a'], fieldIdx: [0], value: [1, 5] }
const inputs = (filter = range, layers = [], source = table) => nativeFilterInputs(source, [filter], layers)

describe('Native membership dependencies', () => {
  it('ignores presentation, GPU mode and unrelated layer changes', () => {
    expect(inputs({ ...range, gpu: true, enlarged: true, plotType: 'lineChart' }, [{ id: 'unrelated' }])).toEqual(inputs())
  })

  it('invalidates for changed values, enabled state, type and field binding', () => {
    for (const change of [{ value: [2, 5] }, { enabled: false }, { type: 'select' }, { fieldIdx: [1] }]) {
      expect(inputs({ ...range, ...change })).not.toEqual(inputs())
    }
  })

  it('captures spatial inputs before Kepler mutates the same layer object', () => {
    const polygon = { ...range, type: 'polygon', layerId: ['point'] }
    const layer = { id: 'point', type: 'point', config: { dataId: 'a', columns: { lat: { fieldIdx: 0 } }, columnMode: 'points' } }
    const before = inputs(polygon, [layer])
    layer.config = { ...layer.config, color: [255, 0, 0] }
    expect(inputs(polygon, [layer])).toEqual(before)
    layer.config = { ...layer.config, columns: { lat: { fieldIdx: 1 } } }
    expect(inputs(polygon, [layer])).not.toEqual(before)
    expect(inputs(polygon, [])).not.toEqual(before)
  })

  it('includes data revision and time/spatial accessors', () => {
    const before = inputs()
    const next = inputs(range, [], { ...table, dataContainer: { numRows: () => 10 } })
    expect(next[0]).not.toBe(before[0])
    expect(inputs(range, [], { ...table, fields: [{ ...table.fields[0], format: 'yyyy' }] })).not.toEqual(before)
    const polygon = { ...range, type: 'polygon', layerId: ['geo'] }
    const layer = { id: 'geo', type: 'geojson', config: { dataId: 'a' }, centroids: [[1, 2]] }
    const spatial = inputs(polygon, [layer])
    layer.centroids = [[3, 4]]
    expect(inputs(polygon, [layer])).not.toEqual(spatial)
  })
})
