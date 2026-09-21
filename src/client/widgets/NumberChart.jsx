import React, { useEffect, useState } from 'react'
import { z } from 'zod'
import { Hash } from 'lucide-react'
import { Field, ColumnSelector, getMosaicSqlTableReference } from '@sqlrooms/mosaic'
import { useMosaicChartSettingsContext } from '@sqlrooms/mosaic/dist/charts/chart-settings/MosaicChartSettingsContext'
import { Combobox, Input } from '@sqlrooms/ui'
import { MosaicClient } from '@uwdata/mosaic-core'
import { Query, column, count, sum, avg, min, max, median, sql } from '@uwdata/mosaic-sql'
import styles from './NumberChart.module.css'

const operations = { count: 'Count rows', distinct: 'Count distinct', sum: 'Sum', avg: 'Average', min: 'Minimum', max: 'Maximum', median: 'Median' }
const formats = { auto: 'Auto', number: 'Number', compact: 'Compact', percent: 'Percent' }
const settingsSchema = z.object({
  operation: z.enum(Object.keys(operations)).default('count'),
  field: z.string().optional(),
  subtitle: z.string().default(''),
  format: z.enum(Object.keys(formats)).default('auto'),
  decimals: z.number().int().min(0).max(6).default(2),
  prefix: z.string().default(''),
  suffix: z.string().default('')
}).refine(settings => settings.operation === 'count' || Boolean(settings.field), { message: 'Choose a field' })

// Register a single extension in SQLRooms; creation and editing share its settings component.
export const numberChartType = {
  id: 'number',
  label: 'Number',
  description: 'A single metric: count, sum, average and more.',
  aiDescription: 'Display one aggregate over the filtered dataset.',
  icon: Hash,
  schema: settingsSchema,
  settingsComponent: NumberSettings,
  renderer: NumberChart,
  buildTitle: settings => settings.operation && settings.operation !== 'count' ? `${operations[settings.operation]} of ${settings.field}` : 'Row count'
}

function Option ({ label, value, options, onChange }) {
  return <Field label={label}><Combobox value={value} onChange={onChange}><Combobox.Trigger ariaLabel={label}><span>{options[value]}</span></Combobox.Trigger><Combobox.Content>{Object.entries(options).map(([key, label]) => <Combobox.Item key={key} value={key}>{label}</Combobox.Item>)}</Combobox.Content></Combobox></Field>
}

// Reuse SQLRooms fields and selectors so the extension follows the same inline editor conventions.
function NumberSettings () {
  const { config, onChangeConfig } = useMosaicChartSettingsContext('number')
  const settings = { operation: 'count', format: 'auto', decimals: 2, ...config.settings }
  const Selector = settings.operation === 'distinct' ? ColumnSelector : ColumnSelector.Numeric
  return (
    <div className={styles.settings}>
      <Option label='Operation' value={settings.operation} options={operations} onChange={value => onChangeConfig('operation', value)} />
      {settings.operation !== 'count' && <Field label='Field' required><Selector value={settings.field} onChange={value => onChangeConfig('field', value)} /></Field>}
      <Field label='Subtitle'><Input aria-label='Subtitle' placeholder='Explain this metric (optional)' value={settings.subtitle || ''} onChange={event => onChangeConfig('subtitle', event.target.value)} /></Field>
      <Option label='Number format' value={settings.format} options={formats} onChange={value => onChangeConfig('format', value)} />
      {settings.format !== 'auto' && <Option label='Decimal places' value={String(settings.decimals)} options={{ 0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' }} onChange={value => onChangeConfig('decimals', Number(value))} />}
      {settings.format === 'percent' && <p className={styles.hint}>A value of 0.25 displays as 25%.</p>}
      <div className={styles.units}><Field label='Prefix'><Input aria-label='Prefix' placeholder='e.g. €' value={settings.prefix || ''} onChange={event => onChangeConfig('prefix', event.target.value)} /></Field><Field label='Suffix'><Input aria-label='Suffix' placeholder='e.g. kWh' value={settings.suffix || ''} onChange={event => onChangeConfig('suffix', event.target.value)} /></Field></div>
    </div>
  )
}

// Mosaic owns query scheduling and subscriptions, including all active dataset filters.
class NumberClient extends MosaicClient {
  constructor (selection, table, settings, onChange) {
    super(selection)
    this.table = table
    this.settings = settings
    this.onChange = onChange
  }

  query (filter) {
    const { operation, field } = this.settings
    const expression = operation === 'count' ? count() : operation === 'distinct' ? sql`COUNT(DISTINCT ${column(field)})` : { sum, avg, min, max, median }[operation](field)
    return Query.from(getMosaicSqlTableReference(this.table)).select({ value: expression }).where(filter)
  }

  queryPending () { this.onChange(previous => ({ ...previous, error: false, loading: true })); return this }
  queryResult (data) { this.onChange({ value: data.toArray()[0]?.value }); return this }
  queryError () { this.onChange({ error: true }); return this }
}

// Present empty aggregates explicitly; never turn a missing average into a misleading zero.
function NumberChart ({ config, coordinator, table, params }) {
  const [result, setResult] = useState({ loading: true })
  const parsed = settingsSchema.safeParse(config.settings)
  const settings = parsed.success ? parsed.data : null
  const { operation, field } = settings || {}
  const selection = params?.get('brush')
  useEffect(() => {
    if (!operation) return
    let alive = true
    setResult(previous => ({ ...previous, loading: true }))
    const client = new NumberClient(selection, table, { operation, field }, result => { if (alive) setResult(result) })
    coordinator.connect(client)
    return () => { alive = false; client.destroy() }
  }, [coordinator, table, selection, operation, field])
  if (!settings) return <div className={styles.message}>Choose a field in chart settings.</div>
  // A metric whose query failed disappears; errors are never shown inline.
  if (result.error) return null
  const options = settings.format === 'auto' ? { maximumFractionDigits: 2 } : { minimumFractionDigits: settings.decimals, maximumFractionDigits: settings.decimals, ...(settings.format === 'compact' ? { notation: 'compact' } : {}), ...(settings.format === 'percent' ? { style: 'percent' } : {}) }
  const value = result.loading && result.value === undefined ? '…' : result.value == null ? 'No data' : new Intl.NumberFormat(undefined, options).format(result.value)
  return <div className={styles.card} data-testid='number-chart' aria-busy={Boolean(result.loading)}><div className={styles.value} aria-live='polite' title={result.value == null ? undefined : String(result.value)}>{result.value != null && settings.prefix}<span data-testid='number-value'>{value}</span>{result.value != null && settings.suffix && <span className={styles.unit}>{settings.suffix}</span>}</div>{settings.subtitle && <p className={styles.subtitle}>{settings.subtitle}</p>}</div>
}
