import { parseWidgetsConfig, serializeWidgetsConfig } from './widgetsConfig'
import { expect, test } from 'vitest'

const panel = { id: 'count_1', type: 'vgplot', title: 'Rows', config: { chartType: 'number', settings: { operation: 'count' } } }

test('serializes declarative widget config without runtime authority', () => {
  const saved = serializeWidgetsConfig({ dashboardsById: { dataset_1: { id: 'dataset_1', title: 'Widgets', selectedTable: 'secret', updatedAt: 1, panels: [panel], layout: { children: [{ panel: { meta: { panelId: 'count_1' } } }] } } } })
  expect(saved.config.dashboardsById.dataset_1).toEqual({ id: 'dataset_1', title: 'Widgets', panelOrder: ['count_1'], panels: [{ ...panel, config: { ...panel.config, settings: { operation: 'count', format: 'auto', decimals: 2, subtitle: '', prefix: '', suffix: '' } } }] })
  expect(JSON.stringify(saved)).not.toMatch(/secret|updatedAt|layout/)
})

test('rejects unsupported persisted content', () => {
  const raw = JSON.stringify({ version: 2, provider: 'sqlrooms', config: { dashboardsById: {} } })
  expect(() => parseWidgetsConfig(raw)).toThrow('Invalid persisted widget configuration')
})

test('normalizes missing content to an empty Widgets V1 config', () => {
  expect(parseWidgetsConfig('')).toMatchObject({ config: { version: 1, provider: 'sqlrooms', config: { dashboardsById: {} } } })
})
