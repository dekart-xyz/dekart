import { useEffect, useMemo, useState } from 'react'
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

// Pass-through retention that reports the panel as painted after its first drawn result.
export default function usePaintedRetention (retention, panelId) {
  const tracking = useStoreWithMosaicDashboard(state => state.paintedPanels !== null)
  const markPanelPainted = useStoreWithMosaicDashboard(state => state.markPanelPainted)
  const [chart, setChart] = useState(null)
  useEffect(() => {
    // Watch only in snapshot renders, once both the created chart and its panel id are known.
    if (!tracking || !chart || !panelId) return
    return watchPlotPainted(chart, () => markPanelPainted(panelId))
  }, [tracking, chart, panelId, markPanelPainted])
  return useMemo(() => ({
    setChart (next) {
      retention?.setChart(next)
      // Normal sessions skip the extra render; only snapshots read painted state.
      if (tracking) setChart(next)
    }
  }), [retention?.setChart, tracking])
}
