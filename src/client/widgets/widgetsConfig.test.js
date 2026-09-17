import { applyWidgetsConfig, parseWidgetsConfig, serializeWidgetsConfig } from './widgetsConfig'
import { expect, test } from 'vitest'

const panel = { id: 'count_1', type: 'vgplot', title: 'Rows', config: { chartType: 'number', settings: { operation: 'count' } } }

test('serializes declarative widget config without runtime authority', () => {
  const saved = serializeWidgetsConfig({ dashboardsById: { dataset_1: { id: 'dataset_1', title: 'Widgets', selectedTable: 'secret', updatedAt: 1, panels: [panel], layout: { children: [{ panel: { meta: { panelId: 'count_1' } } }] } } } })
  expect(saved.config.dashboardsById.dataset_1).toEqual({ id: 'dataset_1', title: 'Widgets', panelOrder: ['count_1'], panels: [{ ...panel, config: { ...panel.config, settings: { operation: 'count', format: 'auto', decimals: 2, subtitle: '', prefix: '', suffix: '' } } }] })
  expect(JSON.stringify(saved)).not.toMatch(/secret|updatedAt|layout/)
})

test('preserves unsupported content as opaque', () => {
  const raw = JSON.stringify({ version: 2, provider: 'sqlrooms', config: { dashboardsById: {} } })
  expect(parseWidgetsConfig(raw)).toMatchObject({ raw, compatibility: 'opaque', config: null })
})

test('reconstructs runtime table and order from dataset binding', () => {
  const calls = []
  const api = { clearAllDashboardRuntime: () => calls.push('clear'), setConfig: value => calls.push(value), ensureDashboard: (...args) => calls.push(args), setSelectedTable: (...args) => calls.push(args), addPanel: (...args) => calls.push(args) }
  applyWidgetsConfig({ getState: () => ({ mosaicDashboard: api }) }, { config: { dashboardsById: { dataset_1: { id: 'dataset_1', title: 'Widgets', panelOrder: ['count_1'], panels: [panel] } } } })
  expect(calls).toContainEqual(['dataset_1', '"memory"."widgets"."d_dataset_1"'])
  expect(calls.at(-1)).toEqual(['dataset_1', panel])
})
