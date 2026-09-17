import React, { useMemo } from 'react'
import { VgPlotChart } from '@sqlrooms/mosaic'
import { createHistogramSpec } from '@sqlrooms/mosaic/dist/charts/chart-types/histogram/spec'

export function createDekartHistogramSpec (options) {
  const spec = createHistogramSpec(options)
  return {
    ...spec,
    yAxis: null,
    yLabel: null,
    xLabel: null,
    xTicks: 4,
    margins: { left: 8, right: 8, top: 8, bottom: 28 },
    plot: spec.plot.map(mark => mark.mark
      ? { ...mark, fill: mark.data.filterBy ? (options.settings.color || '#36b99a') : '#1b1e26' }
      : mark.select === 'intervalX' ? { ...mark, field: options.settings.field } : mark)
  }
}

// Do not read an external retained chart after a source-revision remount. The
// new instance still publishes its interactors for filter ownership.
export default function HistogramChart ({ config, dataTable, selectionName, retention, params, dataPolicy, runtimeIssueContext, runtimeIssueReporter }) {
  const spec = useMemo(() => createDekartHistogramSpec({ dataTable, selectionName, settings: config.settings }), [config.settings, dataTable, selectionName])
  const writeOnlyRetention = useMemo(() => retention && { setChart: retention.setChart }, [retention?.setChart])
  return <VgPlotChart spec={spec} params={params} retention={writeOnlyRetention} dataPolicy={dataPolicy} runtimeIssueContext={runtimeIssueContext} runtimeIssueReporter={runtimeIssueReporter} />
}
