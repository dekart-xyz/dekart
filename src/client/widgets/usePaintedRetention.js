import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStoreWithMosaicDashboard } from '@sqlrooms/mosaic'

// A vgplot chart has painted once every mark finished and the plot put its SVG in the DOM.
// Mark results arrive before the plot renders on the next frame, so the SVG is part of the check.
function watchPlotPainted (chart, onPainted) {
  let frame
  const check = () => {
    const states = [...(chart.markStates?.values() || [])]
    const done = states.length > 0 && states.every(state => state === 'success' || state === 'error')
    const element = chart.element?.classList?.contains('plot') ? chart.element : chart.element?.querySelector?.('.plot')
    if (done && (states.includes('error') || (element?.value && !element.value.pendingRender && element.querySelector('svg')))) {
      onPainted()
      return
    }
    frame = window.requestAnimationFrame(check)
  }
  check()
  return () => window.cancelAnimationFrame(frame)
}

// Keep chart interactions working after a redraw and report when the chart has drawn.
// TODO: move to dark library
export default function usePaintedRetention (retention, panelId, runtimePanelId) {
  // Report images need a signal when every chart has finished drawing.
  const tracking = useStoreWithMosaicDashboard(state => state.paintedPanels !== null)
  const markPanelPainted = useStoreWithMosaicDashboard(state => state.markPanelPainted)
  const registerPanelClient = useStoreWithMosaicDashboard(state => state.mosaicDashboard.registerPanelClient)
  const unregisterPanelClient = useStoreWithMosaicDashboard(state => state.mosaicDashboard.unregisterPanelClient)
  const getPanelClients = useStoreWithMosaicDashboard(state => state.mosaicDashboard.getPanelClients)
  const [chart, setChart] = useState(null)
  // Remember what the chart now uses, what the panel knows about, and any scheduled update.
  const clients = useRef([])
  const registered = useRef(new Set())
  const frame = useRef(null)
  // The chart supplies both IDs in one string; split them to find its panel.
  const match = /^dashboard:(.*):panel:(.*)$/.exec(runtimePanelId || '')
  const dashboardId = match?.[1]
  const registeredPanelId = match?.[2]
  const panelConfig = useStoreWithMosaicDashboard(state => state.mosaicDashboard.config.dashboardsById[dashboardId]?.panels.find(panel => panel.id === registeredPanelId))
  // Remove old handlers, then add the handlers from the chart's latest drawing.
  const ensureClients = useCallback(() => {
    if (!dashboardId || !registeredPanelId) return
    for (const client of registered.current) {
      if (!clients.current.includes(client)) {
        unregisterPanelClient(dashboardId, registeredPanelId, client)
        registered.current.delete(client)
      }
    }
    for (const client of clients.current) {
      if (!getPanelClients(dashboardId, registeredPanelId).includes(client)) registerPanelClient(dashboardId, registeredPanelId, client)
      registered.current.add(client)
    }
  }, [dashboardId, registeredPanelId, getPanelClients, registerPanelClient, unregisterPanelClient])
  // Let the chart library finish replacing its handlers before updating the panel.
  // Cancel an earlier update if a newer drawing arrives first.
  const scheduleClients = useCallback(() => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current)
    frame.current = window.requestAnimationFrame(() => {
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null
        ensureClients()
      })
    })
  }, [ensureClients])
  // A settings change can replace handlers even if the chart stays on screen.
  useEffect(() => {
    scheduleClients()
  }, [panelConfig, scheduleClients])
  // Stop pending work and remove these handlers when the chart goes away.
  useEffect(() => () => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current)
    for (const client of registered.current) unregisterPanelClient(dashboardId, registeredPanelId, client)
  }, [dashboardId, registeredPanelId, unregisterPanelClient])
  useEffect(() => {
    // Report images wait until the drawn chart is on the page.
    if (!tracking || !chart || !panelId) return
    return watchPlotPainted(chart, () => markPanelPainted(panelId))
  }, [tracking, chart, panelId, markPanelPainted])
  return useMemo(() => ({
    setChart (next) {
      // Keep the chart library's original callback working.
      retention?.setChart(next)
      // A new drawing may provide different click and drag handlers.
      const nextClients = next?.element?.value?.interactors || []
      if (clients.current.length !== nextClients.length || clients.current.some((client, index) => client !== nextClients[index])) {
        clients.current = nextClients
        scheduleClients()
      }
      // Only report images need to watch whether this chart has finished drawing.
      if (tracking) setChart(next)
    }
  }), [retention?.setChart, scheduleClients, tracking])
}
