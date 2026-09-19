// REVIEW: Render SQLRooms histograms with selection emphasis synchronized from matching Kepler numeric filters.
import React, { useEffect, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { getMosaicDashboardPanelId, useStoreWithMosaicDashboard, VgPlotChart } from '@sqlrooms/mosaic'
import { createHistogramSpec } from '@sqlrooms/mosaic/dist/charts/chart-types/histogram/spec'

const noClients = []

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
  const runtimeKey = useStoreWithMosaicDashboard(state => {
    for (const [dashboardId, dashboard] of Object.entries(state.mosaicDashboard.config.dashboardsById)) {
      const panel = dashboard.panels.find(panel => panel.config === config)
      if (panel) return getMosaicDashboardPanelId(dashboardId, panel.id)
    }
  })
  const clients = useStoreWithMosaicDashboard(state => state.mosaicDashboard.runtime.panelClients[runtimeKey] || noClients)
  const filters = useSelector(state => state.keplerGl.kepler?.visState.filters || [])
  const range = useMemo(() => {
    const [dashboardKey, panelId] = runtimeKey?.split(':panel:') || []
    const dashboardId = dashboardKey?.slice('dashboard:'.length)
    const matching = filters.filter(filter => {
      const datasetIndex = filter.dataId.indexOf(dashboardId)
      const owned = filter.id === `widget:${panelId}`
      const native = !filter.id.startsWith('widget:') && datasetIndex >= 0 && filter.name[datasetIndex] === config.settings.field
      return filter.enabled !== false && filter.value?.length === 2 && (owned || native)
    })
    if (!matching.length) return null
    const lower = Math.max(...matching.map(filter => filter.value[0]))
    const upper = Math.min(...matching.map(filter => filter.value[1]))
    return lower <= upper ? [lower, upper] : []
  }, [filters, runtimeKey, config.settings.field])
  useEffect(() => {
    const client = clients.find(client => client.selection && client.brush)
    if (!client) return
    if (!range) return client.reset()
    let frame
    // Restored filters can arrive before Mosaic initializes the retained brush DOM and scale.
    const syncBrush = () => {
      if (!client.g || !client.scale) {
        frame = window.requestAnimationFrame(syncBrush)
        return
      }
      client.value = range.length ? range : undefined
      if (range.length) client.g.call(client.brush.moveSilent, range.map(client.scale.apply).sort((a, b) => a - b))
      else client.brush.reset(client.g)
    }
    frame = window.requestAnimationFrame(syncBrush)
    return () => window.cancelAnimationFrame(frame)
  }, [clients, range])
  const spec = useMemo(() => createDekartHistogramSpec({ dataTable, selectionName, settings: config.settings }), [config.settings, dataTable, selectionName])
  const writeOnlyRetention = useMemo(() => retention && { setChart: retention.setChart }, [retention?.setChart])
  return <VgPlotChart spec={spec} params={params} retention={writeOnlyRetention} dataPolicy={dataPolicy} runtimeIssueContext={runtimeIssueContext} runtimeIssueReporter={runtimeIssueReporter} />
}
