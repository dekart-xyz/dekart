import React, { Component, createContext, useContext, useEffect, useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@sqlrooms/ui'
import { useStoreWithMosaicDashboard } from '@sqlrooms/mosaic'
import { useTablesWithColumns } from '@sqlrooms/mosaic/dist/hooks/useTablesWithColumns'
import { resolveMosaicTableReference } from '@sqlrooms/mosaic/dist/mosaicTableReference'
import styles from './ReportWidgets.module.css'

const WidgetSlotContext = createContext(null)

export const WidgetSlotProvider = WidgetSlotContext.Provider

function handleReloadPage () {
  window.location.reload()
}

// Report terminal widget bodies to the snapshot readiness tracker.
function useMarkPanelPainted (panelId, painted) {
  const markPanelPainted = useStoreWithMosaicDashboard(state => state.markPanelPainted)
  useEffect(() => {
    if (painted) markPanelPainted(panelId)
  }, [markPanelPainted, painted, panelId])
}

// Keep technical failure details out of the DOM while preserving the panel shell.
function WidgetFailure ({ panelId }) {
  useMarkPanelPainted(panelId, true)
  return (
    <div className={styles.widgetFailure} role='alert'>
      <AlertTriangle size={13} color='#E86A6F' aria-hidden='true' />
      <span>This chart couldn&apos;t load. <button type='button' onClick={handleReloadPage}>Reload the page.</button></span>
    </div>
  )
}

function WidgetStub () {
  return <div className={styles.chartStub} data-testid='chart-stub' aria-hidden='true'><div className={styles.stubLabel} /><div className={styles.stubLines}><i /><i /><i /></div></div>
}

function WidgetSourceState ({ panelId, state }) {
  const failed = Boolean(state.error)
  const empty = state.snapshot && !state.loadable
  const handleOpenData = state.onOpenData
  useMarkPanelPainted(panelId, failed || empty)
  // Source failures keep their existing message and recovery action.
  if (failed) return <div role='alert' className={styles.error}>{state.error}{!state.snapshot && <Button onClick={handleOpenData}>Open data</Button>}</div>
  // Snapshots cannot recover a source that has no loadable data.
  if (empty) return <div className={styles.empty}>No data to chart yet.</div>
  return <WidgetStub />
}

// Keep render exceptions below the normal panel header and publish one sticky panel failure.
class WidgetErrorBoundary extends Component {
  constructor (props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError () {
    return { failed: true }
  }

  componentDidCatch (error, errorInfo) {
    console.error(`[WidgetErrorBoundary] Error rendering panel (${this.props.panelType}):`, error, errorInfo)
    this.props.failPanel(this.props.panelId)
  }

  render () {
    return this.state.failed ? <WidgetFailure panelId={this.props.panelId} /> : this.props.children
  }
}

// Replace only the chart body so the upstream title and actions remain intact.
export default function DekartChartPanel ({ Renderer, ...props }) {
  const { dashboard, panel } = props
  const slot = useContext(WidgetSlotContext)
  const failed = useStoreWithMosaicDashboard(state => Boolean(state.failedPanels[panel.id]))
  const failPanel = useStoreWithMosaicDashboard(state => state.failPanel)
  const connectionStatus = useStoreWithMosaicDashboard(state => state.mosaic.connection.status)
  const supported = useStoreWithMosaicDashboard(state => state.mosaicDashboard.chartTypes.some(type => type.id === panel.config.chartType))
  const tables = useTablesWithColumns()
  const dataTable = useMemo(() => resolveMosaicTableReference(tables, dashboard.selectedTable).table, [dashboard.selectedTable, tables])
  const sourceUnavailable = Boolean(slot && (slot.error || slot.pending || !slot.physical || (slot.snapshot && !slot.loadable)))
  const shouldFail = !sourceUnavailable && Boolean(dataTable) && (connectionStatus === 'error' || !supported)
  useEffect(() => {
    // Only terminal renderer failures become sticky; loading and registration states remain recoverable.
    if (shouldFail) failPanel(panel.id)
  }, [failPanel, panel.id, shouldFail])

  // A recorded renderer failure always wins over later runtime recovery.
  if (failed || shouldFail) return <WidgetFailure panelId={panel.id} />
  // Query-level states occupy the widget slot without becoming sticky widget failures.
  if (sourceUnavailable) return <WidgetSourceState panelId={panel.id} state={slot} />
  // Tables and the shared connection can be registered after the panel shell mounts.
  if (!dataTable || connectionStatus === 'loading' || connectionStatus === 'idle') return <WidgetStub />
  return <WidgetErrorBoundary panelId={panel.id} panelType={panel.type} failPanel={failPanel}><Renderer {...props} /></WidgetErrorBoundary>
}
