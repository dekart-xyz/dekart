import { describe, expect, it } from 'vitest'
import { KeplerGlLayers } from '@kepler.gl/layers'
import { INITIAL_MAP_STATE, INITIAL_MAP_STYLE, visStateUpdaters } from '@kepler.gl/reducers'
import { KeplerGlSchema } from '@kepler.gl/schemas'
import { getMapConfigToSave } from './mapConfig'

// Real Kepler layers provide the same serialization contract used by the map editor.
function pointLayer (id, dataId) {
  return new KeplerGlLayers.PointLayer({
    id,
    dataId,
    label: id,
    color: [18, 147, 154],
    columns: {
      lat: { value: 'latitude', fieldIdx: 0 },
      lng: { value: 'longitude', fieldIdx: 1 }
    }
  })
}

// Supply Kepler's native state shape without invoking app state, hooks, or network calls.
function keplerState (layers, fieldsToShow = {}) {
  const initial = visStateUpdaters.INITIAL_VIS_STATE
  return {
    visState: {
      ...initial,
      layers,
      layerOrder: layers.map(layer => layer.id),
      layerToBeMerged: [],
      interactionConfig: {
        ...initial.interactionConfig,
        tooltip: {
          ...initial.interactionConfig.tooltip,
          config: { ...initial.interactionConfig.tooltip.config, fieldsToShow }
        }
      }
    },
    mapState: { ...INITIAL_MAP_STATE },
    mapStyle: { ...INITIAL_MAP_STYLE }
  }
}

// Pending layers are produced by Kepler's real saved-config parser, not test doubles.
function withPendingLayers (kepler, saved, ids) {
  return {
    ...kepler,
    visState: {
      ...kepler.visState,
      layerToBeMerged: KeplerGlSchema.parseSavedConfig(saved).visState.layers
        .filter(layer => ids.includes(layer.id))
    }
  }
}

describe('getMapConfigToSave', () => {
  it('preserves the saved configuration when an empty query leaves all layers pending', () => {
    const saved = KeplerGlSchema.getConfigToSave(keplerState([
      pointLayer('station-layer', 'stations')
    ], { stations: [{ name: 'station_code', format: null }] }))
    const kepler = withPendingLayers(keplerState([]), saved, ['station-layer'])
    const savedJson = JSON.stringify(saved)
    const nativeBefore = KeplerGlSchema.getConfigToSave(kepler)
    const pendingBefore = JSON.stringify(kepler.visState.layerToBeMerged)

    expect(nativeBefore.config.visState.layers).toEqual([])
    expect(getMapConfigToSave(kepler, savedJson)).toEqual(saved)
    expect(KeplerGlSchema.getConfigToSave(kepler)).toEqual(nativeBefore)
    expect(JSON.stringify(kepler.visState.layerToBeMerged)).toBe(pendingBefore)
    expect(JSON.stringify(saved)).toBe(savedJson)
  })

  it('preserves pending layers while retaining edits, reordering, and tooltips of loaded layers', () => {
    const a = pointLayer('a', 'loaded-a')
    const b = pointLayer('b', 'pending-b')
    const c = pointLayer('c', 'loaded-c')
    const d = pointLayer('d', 'pending-d')
    const saved = KeplerGlSchema.getConfigToSave(keplerState([a, b, c, d], {
      'loaded-a': [{ name: 'old_field', format: null }],
      'pending-b': [{ name: 'station_code', format: null }],
      'pending-d': [{ name: 'service_min', format: '.1f' }]
    }))
    c.updateLayerConfig({ label: 'Edited C', isVisible: false, color: [255, 0, 0] })
    const kepler = withPendingLayers(keplerState([c, a], {
      'loaded-a': [{ name: 'new_field', format: null }]
    }), saved, ['b', 'd'])

    const result = getMapConfigToSave(kepler, JSON.stringify(saved)).config.visState

    expect(result.layers.map(layer => layer.id)).toEqual(['c', 'd', 'a', 'b'])
    expect(result.layers[0].config).toMatchObject({ label: 'Edited C', isVisible: false, color: [255, 0, 0] })
    expect(result.layers[1]).toEqual(saved.config.visState.layers[3])
    expect(result.layers[3]).toEqual(saved.config.visState.layers[1])
    expect(result.interactionConfig.tooltip.fieldsToShow).toEqual({
      'loaded-a': [{ name: 'new_field', format: null }],
      'pending-b': [{ name: 'station_code', format: null }],
      'pending-d': [{ name: 'service_min', format: '.1f' }]
    })
  })

  it('does not resurrect a loaded layer or its tooltip after an authored deletion', () => {
    const saved = KeplerGlSchema.getConfigToSave(keplerState([
      pointLayer('pending', 'pending-data'),
      pointLayer('deleted', 'deleted-data')
    ], {
      'pending-data': [{ name: 'station_code', format: null }],
      'deleted-data': [{ name: 'removed_field', format: null }]
    }))
    const kepler = withPendingLayers(keplerState([]), saved, ['pending'])

    const result = getMapConfigToSave(kepler, JSON.stringify(saved)).config.visState

    expect(result.layers.map(layer => layer.id)).toEqual(['pending'])
    expect(result.interactionConfig.tooltip.fieldsToShow).toEqual({
      'pending-data': [{ name: 'station_code', format: null }]
    })
  })

  it('exports live edits and newly added layers when nothing is pending', () => {
    const existing = pointLayer('existing', 'data')
    const saved = KeplerGlSchema.getConfigToSave(keplerState([existing]))
    existing.updateLayerConfig({ isVisible: false })
    const kepler = keplerState([pointLayer('new', 'new-data'), existing])

    const result = getMapConfigToSave(kepler, JSON.stringify(saved))

    expect(result).toEqual(KeplerGlSchema.getConfigToSave(kepler))
    expect(result.config.visState.layers.map(layer => layer.id)).toEqual(['new', 'existing'])
    expect(result.config.visState.layers[1].config.isVisible).toBe(false)
  })

  it('keeps a pending layer before its surviving successor after deleting the preceding layer', () => {
    const successor = pointLayer('c', 'loaded-c')
    const saved = KeplerGlSchema.getConfigToSave(keplerState([
      pointLayer('a', 'deleted-a'), pointLayer('b', 'pending-b'), successor
    ]))
    const kepler = withPendingLayers(keplerState([successor]), saved, ['b'])

    const result = getMapConfigToSave(kepler, JSON.stringify(saved)).config.visState

    expect(result.layers.map(layer => layer.id)).toEqual(['b', 'c'])
  })

  it.each([undefined, null, ''])('uses the native export without a saved configuration (%s)', savedJson => {
    const saved = KeplerGlSchema.getConfigToSave(keplerState([pointLayer('pending', 'data')]))
    const kepler = withPendingLayers(keplerState([pointLayer('live', 'live-data')]), saved, ['pending'])

    expect(getMapConfigToSave(kepler, savedJson)).toEqual(KeplerGlSchema.getConfigToSave(kepler))
  })

  it('deduplicates legacy saved layers without duplicating a pending layer', () => {
    const saved = KeplerGlSchema.getConfigToSave(keplerState([pointLayer('pending', 'data')]))
    saved.config.visState.layers.push(structuredClone(saved.config.visState.layers[0]))
    const kepler = withPendingLayers(keplerState([]), saved, ['pending'])

    const result = getMapConfigToSave(kepler, JSON.stringify(saved))

    expect(result.config.visState.layers).toEqual([saved.config.visState.layers[0]])
    expect(saved.config.visState.layers).toHaveLength(2)
  })

  it('preserves a pending layer when the saved configuration has no tooltip section', () => {
    const saved = KeplerGlSchema.getConfigToSave(keplerState([pointLayer('pending', 'data')]))
    delete saved.config.visState.interactionConfig
    const kepler = withPendingLayers(keplerState([]), saved, ['pending'])

    const result = getMapConfigToSave(kepler, JSON.stringify(saved)).config.visState

    expect(result.layers).toEqual(saved.config.visState.layers)
    expect(result.interactionConfig.tooltip.fieldsToShow).toEqual({})
  })
})
