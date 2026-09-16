import React, { useEffect, useMemo, useState } from 'react'
import { Selection } from '@uwdata/mosaic-core'
import { column, isIn, literal } from '@uwdata/mosaic-sql'
import { useSelector } from 'react-redux'
import { duckDBViewName } from '../lib/duckdb/constants'
import { VgPlotChart } from '@sqlrooms/mosaic'
import { createCountPlotSpec } from '@sqlrooms/mosaic/dist/charts/chart-types/count-plot/spec'
import { useCountPlotCategoryCount } from '@sqlrooms/mosaic/dist/charts/chart-types/count-plot/renderer/useCountPlotCategoryCount'
import styles from './CategoryChart.module.css'

// Retain the upstream query, settings and selection clients, with a readable sidebar layout.
export default function CategoryChart ({ config, coordinator, dataTable, table, selectionName, ...chartProps }) {
  const layer = useSelector(state => {
    const matches = (state.keplerGl.kepler?.visState.layers || []).filter(layer => layer.config.colorField?.name === config.settings.field && duckDBViewName(layer.config.dataId) === table.table)
    return matches.find(layer => layer.config.isVisible) || matches[0]
  })
  const filter = useSelector(state => state.keplerGl.kepler?.visState.filters.find(filter => filter.name?.includes(config.settings.field) && filter.dataId.some(id => duckDBViewName(id) === table.table)))
  const highlight = useMemo(() => Selection.intersect(), [])
  const params = useMemo(() => new Map(chartProps.params).set('categoryHighlight', highlight), [chartProps.params, highlight])
  useEffect(() => {
    // A visual-only selection highlights the originating chart without changing cross-filter semantics.
    const values = filter?.value
    highlight.update({ source: highlight, value: values || null, predicate: values?.length ? isIn(column(config.settings.field), values.map(literal)) : null })
  }, [highlight, filter, config.settings.field])
  const [expanded, setExpanded] = useState(false)
  const categories = useCountPlotCategoryCount({ coordinator, table, field: config.settings.field })
  const result = useMemo(() => {
    try {
      const spec = createCountPlotSpec({ dataTable, selectionName, settings: config.settings, visibleCategoryCount: categories.count })
      const [background, foreground, value] = spec.plot
      // Evaluate Kepler's actual scale so category assignments survive chart sorting and filtering.
      const colorScale = layer?.getColorScale(layer.config.colorScale, layer.config.colorDomain, layer.config.visConfig.colorRange)
      const colorDomain = layer?.config.colorDomain
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
            { ...foreground, inset: 0, insetTop: 24, insetBottom: 6, fill: colors ? foreground.y : '#36b99a', opacity: 1 },
            { select: 'highlight', by: '$categoryHighlight', opacity: 0.25 },
            { mark: 'text', data: background.data, y: background.y, text: { min: background.y }, title: background.y, frameAnchor: 'left', textAnchor: 'start', dy: -6, fontSize: 11, lineWidth: 21, textOverflow: 'ellipsis', fill: '#e3e7ec', opacity: 1 },
            { select: 'highlight', by: '$categoryHighlight', opacity: 0.4 },
            { ...value, sort: undefined, x: undefined, frameAnchor: 'right', textAnchor: 'end', dx: 0, dy: -6, fontSize: 11, fontWeight: 500, opacity: 1 },
            { select: 'highlight', by: '$categoryHighlight', opacity: 0.4 },
            // A transparent full-width row makes labels, bars and values one click target.
            { mark: 'ruleY', data: background.data, y: background.y, title: { min: background.y }, strokeWidth: 34, strokeOpacity: 0 },
            { select: 'toggleY', as: '$brush' }
          ]
        }
      }
    } catch (error) { return { error: error.message } }
  }, [config.settings, dataTable, selectionName, categories.count, layer])
  if (result.error) return <div className={styles.message}>{result.error}</div>
  const count = Math.min(categories.count ?? 0, config.settings.maxBars ?? 20)
  return <div className={styles.category}><span className={styles.count} data-testid='category-count'>{categories.count} values</span><div className={styles.scroll} style={{ maxHeight: expanded ? undefined : 110, overflowY: expanded ? 'auto' : 'hidden' }} data-testid='category-chart'><div className={styles.plot} style={{ height: result.spec.height }}><VgPlotChart {...chartProps} params={params} spec={result.spec} /></div></div>{count > 3 && <button className={styles.more} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : `Show ${count - 3} more`}</button>}</div>
}
