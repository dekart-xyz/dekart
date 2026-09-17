import { describe, expect, it } from 'vitest'
import { autoCreateWidgetIds } from './datasetReducer'

const reportUpdate = (overrides = {}) => ({
  type: 'reportUpdate',
  initialHydration: false,
  initialAutoCreateLayerIds: [],
  datasetsList: [],
  newDatasetIds: [],
  ...overrides
})

describe('widget default lifecycle', () => {
  it('never infers eligibility during initial hydration', () => {
    expect(autoCreateWidgetIds([], reportUpdate({ initialHydration: true, initialAutoCreateLayerIds: ['pending'], datasetsList: [{ id: 'pending' }] }))).toEqual([])
  })

  it('preserves an exact UI creation response that beats initial hydration', () => {
    const created = autoCreateWidgetIds([], { type: 'widgetDatasetCreated', datasetId: 'ui' })
    expect(autoCreateWidgetIds(created, reportUpdate({ initialHydration: true, initialAutoCreateLayerIds: ['ui'], datasetsList: [{ id: 'ui' }] }))).toEqual(['ui'])
  })

  it('ignores externally added live datasets', () => {
    expect(autoCreateWidgetIds([], reportUpdate({ newDatasetIds: ['external'], datasetsList: [{ id: 'external' }] }))).toEqual([])
  })

  it('retains only the exact dataset returned by UI creation', () => {
    const created = autoCreateWidgetIds([], { type: 'widgetDatasetCreated', datasetId: 'ui' })
    const earlyStream = autoCreateWidgetIds(created, reportUpdate({ newDatasetIds: ['external'], datasetsList: [{ id: 'external' }] }))
    expect(earlyStream).toEqual(['ui'])
    const streamed = autoCreateWidgetIds(earlyStream, reportUpdate({ newDatasetIds: ['ui'], datasetsList: [{ id: 'external' }, { id: 'ui' }] }))
    expect(streamed).toEqual(['ui'])
    expect(autoCreateWidgetIds(streamed, { type: 'widgetsDefaultsConsumed', datasetId: 'ui' })).toEqual([])
  })
})
