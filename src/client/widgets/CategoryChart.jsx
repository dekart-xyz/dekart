import React, { useEffect, useMemo, useState } from 'react'
import { Param } from '@uwdata/mosaic-core'
import { column, cond, list, listContains, not, or } from '@uwdata/mosaic-sql'
import { shallowEqual, useSelector } from 'react-redux'
import { duckDBViewName } from '../lib/duckdb/constants'
import { ColumnSelector, Field, VgPlotChart, useStoreWithMosaicDashboard } from '@sqlrooms/mosaic'
import { useMosaicChartSettingsContext } from '@sqlrooms/mosaic/dist/charts/chart-settings/MosaicChartSettingsContext'
import { Combobox, Input } from '@sqlrooms/ui'
import { createCountPlotSpec } from '@sqlrooms/mosaic/dist/charts/chart-types/count-plot/spec'
import { useCountPlotCategoryCount } from '@sqlrooms/mosaic/dist/charts/chart-types/count-plot/renderer/useCountPlotCategoryCount'
import styles from './CategoryChart.module.css'

const sortOptions = { 'value-desc': 'Value descending', 'value-asc': 'Value ascending', 'label-asc': 'Label A-Z', 'label-desc': 'Label Z-A' }

// V1 intentionally supports category counts only; upstream aggregate and
// left-padding controls are not part of Dekart's persisted contract.
export function CategorySettings () {
  const { config, onChangeConfig } = useMosaicChartSettingsContext('count-plot')
  const sort = config.settings.sort || 'value-desc'
  return <div className={styles.settings}><Field label='Field' required><ColumnSelector.Categorical value={config.settings.field} onChange={value => onChangeConfig('field', value)} /></Field><Field label='Sort'><Combobox value={sort} onChange={value => onChangeConfig('sort', value)}><Combobox.Trigger ariaLabel='Sort'><span>{sortOptions[sort]}</span></Combobox.Trigger><Combobox.Content>{Object.entries(sortOptions).map(([value, label]) => <Combobox.Item key={value} value={value}>{label}</Combobox.Item>)}</Combobox.Content></Combobox></Field><Field label='Max bars'><Input type='number' min={1} max={100} value={config.settings.maxBars ?? 20} onChange={event => onChangeConfig('maxBars', Math.max(1, Math.min(100, Number(event.target.value) || 20)))} /></Field></div>
}

// Retain the upstream query, settings and selection clients, with a readable sidebar layout.
export default function CategoryChart ({ config, coordinator, dataTable, table, selectionName, ...chartProps }) {
  const { layer, scaleType, colorDomain, colorRange } = useSelector(state => {
    const matches = (state.keplerGl.kepler?.visState.layers || []).filter(layer => layer.config.colorField?.name === config.settings.field && duckDBViewName(layer.config.dataId) === table.table)
    const layer = matches.find(layer => layer.config.isVisible) || matches[0]
    // Kepler mutates layer instances; capture color inputs so palette edits notify this chart.
    return { layer, scaleType: layer?.config.colorScale, colorDomain: layer?.config.colorDomain, colorRange: layer?.config.visConfig.colorRange }
  }, shallowEqual)
  const panelId = useStoreWithMosaicDashboard(state => Object.values(state.mosaicDashboard.config.dashboardsById).flatMap(dashboard => dashboard.panels).find(panel => panel.config === config)?.id)
  const filter = useSelector(state => state.keplerGl.kepler?.visState.filters.find(filter => filter.id === `widget:${panelId}`))
  const emphasis = useMemo(() => ({ values: Param.value(list(filter?.value || [])), active: Param.value(Boolean(filter?.value?.length)) }), [config.settings.field, dataTable])
  useEffect(() => {
    const values = list(filter?.value || [])
    if (String(emphasis.values.value) !== String(values)) emphasis.values.update(values)
    emphasis.active.update(Boolean(filter?.value?.length))
  }, [emphasis, filter?.value])
  const [expanded, setExpanded] = useState(false)
  const categories = useCountPlotCategoryCount({ coordinator, table, field: config.settings.field })
  const result = useMemo(() => {
    try {
      const spec = createCountPlotSpec({ dataTable, selectionName, settings: config.settings, visibleCategoryCount: categories.count })
      const [background, foreground, value] = spec.plot
      // Encode selection emphasis in the normal mark query. Mosaic's generic
      // highlight interactor can outlive a refreshed source coordinator.
      const selected = cond(or(not(emphasis.active), listContains(emphasis.values, column(config.settings.field))), 1, 0.25)
      // Evaluate Kepler's actual scale so category assignments survive chart sorting and filtering.
      const colorScale = layer?.getColorScale(scaleType, colorDomain, colorRange)
      const colors = colorScale && colorDomain?.length
        ? {
            colorScale: 'ordinal',
            colorDomain,
            colorRange: colorDomain.map(value => `rgb(${colorScale(value).slice(0, 3).join(',')})`)
          }
        : null
      const rows = Math.max(1, Math.min(categories.count ?? 10, config.settings.maxBars ?? 20))
      return {
        spec: {
          ...spec,
          ...colors,
          params: { ...spec.params, categoryHighlight: { select: 'intersect' } },
          height: rows * 34 + 8,
          margins: { left: 8, right: 8, top: 8, bottom: 8 },
          xAxis: null,
          yAxis: null,
          xLabel: null,
          yLabel: null,
          yPaddingInner: 0,
          yPaddingOuter: 0,
          plot: [
            { mark: 'ruleY', data: background.data, y: background.y, title: { min: background.y }, stroke: '#1b1e26', strokeWidth: 4, dy: 9 },
            { ...foreground, inset: 0, insetTop: 24, insetBottom: 6, fill: colors ? foreground.y : '#36b99a', opacity: selected },
            { mark: 'text', data: background.data, y: background.y, text: { min: background.y }, title: background.y, frameAnchor: 'left', textAnchor: 'start', dy: -6, fontSize: 11, lineWidth: 21, textOverflow: 'ellipsis', fill: '#e3e7ec', opacity: selected },
            { ...value, sort: undefined, x: undefined, frameAnchor: 'right', textAnchor: 'end', dx: 0, dy: -6, fontSize: 11, fontWeight: 500, opacity: selected },
            // A transparent full-width row makes labels, bars and values one click target.
            { mark: 'ruleY', data: background.data, y: background.y, title: { min: background.y }, strokeWidth: 34, strokeOpacity: 0 },
            { select: 'toggleY', as: '$brush' }
          ]
        }
      }
    } catch (error) { return { error: error.message } }
  }, [config.settings, dataTable, selectionName, categories.count, layer, scaleType, colorDomain, colorRange, emphasis])
  if (result.error) return <div className={styles.message}>{result.error}</div>
  const count = Math.min(categories.count ?? 0, config.settings.maxBars ?? 20)
  return <div className={styles.category}><span className={styles.count} data-testid='category-count'>{categories.count} values</span><div className={styles.scroll} style={{ maxHeight: expanded ? undefined : 110, overflowY: expanded ? 'auto' : 'hidden' }} data-testid='category-chart'><div className={styles.plot} style={{ height: result.spec.height }}><FreshVgPlotChart {...chartProps} spec={result.spec} /></div></div>{count > 3 && <button className={styles.more} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : `Show ${count - 3} more`}</button>}</div>
}

// SQLRooms retains charts across layout changes. A source-revision remount must
// publish its new clients without reading the previous revision's cached DOM.
function FreshVgPlotChart ({ retention, ...props }) {
  const writeOnlyRetention = useMemo(() => retention && { setChart: retention.setChart }, [retention?.setChart])
  return <VgPlotChart {...props} retention={writeOnlyRetention} />
}
