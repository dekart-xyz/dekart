import { applyWidgetsConfig, emptyWidgetsConfig, parseWidgetsConfig, reorderWidgets, serializeWidgetsConfig } from './widgetsConfig'
import { expect, test } from 'vitest'

const panels = {
  number: { id: 'number_1', type: 'vgplot', title: 'Rows', config: { chartType: 'number', settings: { operation: 'count' } } },
  category: { id: 'category_1', type: 'vgplot', title: 'Category', config: { chartType: 'count-plot', settings: { field: 'category' } } },
  histogram: { id: 'histogram_1', type: 'vgplot', title: 'Amount', config: { chartType: 'histogram', settings: { field: 'amount' } } }
}

function runtimeConfig () {
  return {
    dashboardsById: {
      dataset_1: {
        id: 'dataset_1',
        title: 'Widgets',
        selectedTable: 'secret',
        panels: [panels.number, panels.category],
        layout: {
          children: [
            { id: 'child-number', panel: { meta: { panelId: 'number_1' } } },
            { id: 'child-category', panel: { meta: { panelId: 'category_1' } } }
          ],
          layouts: { sm: [{ i: 'child-number', x: 0, y: 2 }, { i: 'child-category', x: 0, y: 0 }] }
        }
      },
      dataset_2: {
        id: 'dataset_2',
        title: 'Widgets',
        panels: [panels.histogram],
        layout: {
          children: [{ id: 'child-histogram', panel: { meta: { panelId: 'histogram_1' } } }],
          layouts: { sm: [{ i: 'child-histogram', x: 0, y: 0 }] }
        }
      }
    }
  }
}

function fakeStore () {
  const calls = []
  const api = {
    clearAllDashboardRuntime: () => calls.push(['clear']),
    setConfig: config => calls.push(['setConfig', config]),
    ensureDashboard: id => calls.push(['ensureDashboard', id]),
    setSelectedTable: id => calls.push(['setSelectedTable', id]),
    addPanel: (id, panel) => calls.push(['addPanel', id, panel])
  }
  return { calls, store: { getState: () => ({ mosaicDashboard: api }) } }
}

test('serializes flat widgets with runtime state removed and chart defaults normalized', () => {
  const saved = serializeWidgetsConfig(runtimeConfig())
  expect(saved).toEqual({
    version: 1,
    widgets: [
      { id: 'number_1', dataId: 'dataset_1', type: 'number', title: 'Rows', settings: { operation: 'count', format: 'auto', decimals: 2, subtitle: '', prefix: '', suffix: '' } },
      { id: 'category_1', dataId: 'dataset_1', type: 'count-plot', title: 'Category', settings: { field: 'category', metric: 'count', sort: 'value-desc', maxBars: 20 } },
      { id: 'histogram_1', dataId: 'dataset_2', type: 'histogram', title: 'Amount', settings: { field: 'amount', maxBins: 15 } }
    ]
  })
  expect(JSON.stringify(saved)).not.toMatch(/secret|dashboardsById|layout/)
})

test('preserves every existing position by widget id while applying runtime edits', () => {
  const previous = { version: 1, widgets: [{ id: 'histogram_1', dataId: 'dataset_2' }, { id: 'number_1', dataId: 'dataset_1' }, { id: 'category_1', dataId: 'dataset_1' }] }
  const saved = serializeWidgetsConfig(runtimeConfig(), previous)
  expect(saved.widgets.map(widget => widget.id)).toEqual(['histogram_1', 'number_1', 'category_1'])
  expect(saved.widgets[1].title).toBe('Rows')
})

test('reorders across datasets without changing widget objects or bindings', () => {
  const config = serializeWidgetsConfig(runtimeConfig())
  const reordered = reorderWidgets(config, 'histogram_1', 'number_1')
  expect(reordered.widgets.map(widget => widget.id)).toEqual(['histogram_1', 'number_1', 'category_1'])
  expect(reordered.widgets[0]).toBe(config.widgets[2])
  expect(reordered.widgets[0].dataId).toBe('dataset_2')
})

test('unknown and identical reorder ids preserve the config object', () => {
  const config = serializeWidgetsConfig(runtimeConfig())
  expect(reorderWidgets(config, 'missing', 'number_1')).toBe(config)
  expect(reorderWidgets(config, 'number_1', 'missing')).toBe(config)
  expect(reorderWidgets(config, 'number_1', 'number_1')).toBe(config)
})

test('serialize keeps reordered ids through edits, appends additions, and drops deletions', () => {
  const initial = serializeWidgetsConfig(runtimeConfig())
  const reordered = reorderWidgets(initial, 'histogram_1', 'number_1')
  const runtime = runtimeConfig()
  runtime.dashboardsById.dataset_1.panels[0] = { ...panels.number, title: 'Total rows' }
  runtime.dashboardsById.dataset_1.panels = [...runtime.dashboardsById.dataset_1.panels, { ...panels.histogram, id: 'new_1' }]
  delete runtime.dashboardsById.dataset_2
  const saved = serializeWidgetsConfig(runtime, reordered)
  expect(saved.widgets.map(widget => widget.id)).toEqual(['number_1', 'category_1', 'new_1'])
  expect(saved.widgets[0].title).toBe('Total rows')
})

test('groups widgets by dataId and preserves order within each runtime dashboard', () => {
  const { calls, store } = fakeStore()
  applyWidgetsConfig(store, {
    version: 1,
    widgets: [
      { id: 'a', dataId: 'dataset_1', type: 'number', title: 'A', settings: { operation: 'count' } },
      { id: 'skip', dataId: 'missing', type: 'number', title: 'Skip', settings: { operation: 'count' } },
      { id: 'b', dataId: 'dataset_2', type: 'histogram', title: 'B', settings: { field: 'amount' } },
      { id: 'c', dataId: 'dataset_1', type: 'count-plot', title: 'C', settings: { field: 'category' } }
    ]
  }, ['dataset_1', 'dataset_2'])
  expect(calls.filter(call => call[0] === 'addPanel').map(call => [call[1], call[2].id])).toEqual([['dataset_1', 'a'], ['dataset_2', 'b'], ['dataset_1', 'c']])
  expect(calls[0]).toEqual(['clear'])
  expect(calls[1]).toEqual(['setConfig', { dashboardsById: {} }])
})

test('rejects documents the runtime cannot safely adapt while preserving the raw error boundary', () => {
  const duplicate = JSON.stringify({ version: 1, widgets: [{ id: 'same', dataId: 'a', type: 'number', title: 'A', settings: {} }, { id: 'same', dataId: 'b', type: 'number', title: 'B', settings: {} }] })
  expect(() => parseWidgetsConfig(duplicate)).toThrow('Invalid persisted widget configuration')
  expect(() => parseWidgetsConfig('{')).toThrow('Invalid persisted widget configuration')
})

test('normalizes missing content to an empty flat Widgets V1 config', () => {
  expect(parseWidgetsConfig('')).toEqual({ config: emptyWidgetsConfig(), raw: JSON.stringify(emptyWidgetsConfig()) })
})
