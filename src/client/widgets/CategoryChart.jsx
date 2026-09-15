import React, { useMemo, useState } from 'react'
import { VgPlotChart } from '@sqlrooms/mosaic'
import { createCountPlotSpec } from '@sqlrooms/mosaic/dist/charts/chart-types/count-plot/spec'
import { useCountPlotCategoryCount } from '@sqlrooms/mosaic/dist/charts/chart-types/count-plot/renderer/useCountPlotCategoryCount'
import styles from './CategoryChart.module.css'

// Retain the upstream query, settings and selection clients, with a readable sidebar layout.
export default function CategoryChart ({ config, coordinator, dataTable, table, selectionName, ...chartProps }) {
  const [expanded, setExpanded] = useState(false)
  const categories = useCountPlotCategoryCount({ coordinator, table, field: config.settings.field })
  const result = useMemo(() => {
    try {
      const spec = createCountPlotSpec({ dataTable, selectionName, settings: config.settings, visibleCategoryCount: categories.count })
      const [background, foreground, value] = spec.plot
      const rows = Math.max(1, Math.min(categories.count ?? 10, config.settings.maxBars ?? 20))
      return {
        spec: {
          ...spec,
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
            { ...foreground, inset: 0, insetTop: 24, insetBottom: 6, fill: '#36b99a' },
            { mark: 'text', data: background.data, y: background.y, text: { min: background.y }, title: background.y, frameAnchor: 'left', textAnchor: 'start', dy: -6, fontSize: 11, lineWidth: 21, textOverflow: 'ellipsis', fill: '#e3e7ec' },
            { ...value, sort: undefined, x: undefined, frameAnchor: 'right', textAnchor: 'end', dx: 0, dy: -6, fontSize: 11, fontWeight: 500 },
            // A transparent full-width row makes labels, bars and values one click target.
            { mark: 'ruleY', data: background.data, y: background.y, title: { min: background.y }, strokeWidth: 34, strokeOpacity: 0 },
            { select: 'toggleY', as: '$brush' }
          ]
        }
      }
    } catch (error) { return { error: error.message } }
  }, [config.settings, dataTable, selectionName, categories.count])
  if (result.error) return <div className={styles.message}>{result.error}</div>
  const count = Math.min(categories.count ?? 0, config.settings.maxBars ?? 20)
  return <div className={styles.category}><span className={styles.count} data-testid='category-count'>{categories.count} values</span><div className={styles.scroll} style={{ maxHeight: expanded ? undefined : 110, overflowY: expanded ? 'auto' : 'hidden' }} data-testid='category-chart'><div className={styles.plot} style={{ height: result.spec.height }}><VgPlotChart {...chartProps} spec={result.spec} /></div></div>{count > 3 && <button className={styles.more} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : `Show ${count - 3} more`}</button>}</div>
}
