import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useStore } from 'zustand'
import { RoomShell } from '@sqlrooms/room-shell'
import { getMosaicDashboardSelectionName } from '@sqlrooms/mosaic'
import WidgetContents from './WidgetContents'
import classnames from 'classnames'
import { createWidgetStore, fitWidgetPanels, suggestWidgets } from './widgetStore'
import { applyWidgetsConfig, serializeWidgetsConfig } from './widgetsConfig'
import useWidgetSources from './useWidgetSources'
import { widgetsChanged, widgetsDefaultsConsumed } from '../actions/widgets'
import styles from './ReportWidgets.module.css'
import './theme.css'
const emptyTables = {}
function sameWidgetsConfig (left, right) {
  return left === right || Boolean(left && right && JSON.stringify(left) === JSON.stringify(right))
}

// Mark local widget edits before dispatch so Redux echoes never trigger adoption.
function publishAuthored (adoption, config, dispatch) {
  adoption.current.adoptedConfig = config
  adoption.current.authored.add(config)
  dispatch(widgetsChanged(config))
}

// Replace the currently displayed charts with the latest saved chart configuration
function restoreWidgetsConfig (store, persisted, datasetIds) {
  const state = store.getState()
  const dashboardIds = new Set([
    ...Object.keys(state.mosaicDashboard.config.dashboardsById),
    ...(persisted?.widgets || []).map(widget => widget.dataId)
  ])
  applyWidgetsConfig(store, persisted, datasetIds)
  // Destroy old clients before emitting the reset. Mosaic waits for selection
  // listeners, so resetting first can strand later clicks behind torn-down queries.
  for (const dashboardId of dashboardIds) {
    store.getState().mosaic.getSelection(getMosaicDashboardSelectionName(dashboardId)).reset()
  }
}

// Adopt canonical configuration into the live store. Dashboards for datasets
// that left the report are not restored, and that pruning is published like
// any other authored edit so the next save persists it.
function adoptWidgetsConfig (store, adoption, persisted, datasetIds, datasetKey, editing, dispatch) {
  const tracking = adoption.current
  tracking.applying = true
  restoreWidgetsConfig(store, persisted, datasetIds)
  for (const dashboardId of Object.keys(store.getState().mosaicDashboard.config.dashboardsById)) fitWidgetPanels(store, dashboardId)
  tracking.previousConfig = store.getState().mosaicDashboard.config
  tracking.adoptedConfig = persisted
  tracking.datasetKey = datasetKey
  tracking.applying = false
  const pruned = serializeWidgetsConfig(tracking.previousConfig, persisted)
  if (!editing || sameWidgetsConfig(pruned, persisted)) return
  publishAuthored(adoption, pruned, dispatch)
}

// The panel is part of a report: Redux/report streams own saved state, SQLRooms owns editing.
export default function ReportWidgets ({ visible, snapshot, editing, presentationPending, dataReloadPending, onSettled, onOpenData }) {
  const [queryPending, setQueryPending] = useState(false)
  const [error, setError] = useState('')
  const [configRevision, setConfigRevision] = useState(0)
  const [store] = useState(() => createWidgetStore(setQueryPending, setError, Boolean(snapshot)))
  const report = useSelector(state => state.report)
  const widgets = useSelector(state => state.widgets)
  const tables = useSelector(state => state.keplerGl.kepler?.visState.datasets || emptyTables)
  const downloads = useSelector(state => state.dataset.downloading)
  const jobs = useSelector(state => state.queryJobs)
  const files = useSelector(state => state.files)
  const localJobs = useSelector(state => state.duckDBJobStates)
  const paramsHash = useSelector(state => state.queryParams.hash)
  const datasetList = useSelector(state => state.dataset.list)
  const autoCreateWidgetIds = useSelector(state => state.dataset.autoCreateWidgetIds)
  const dispatch = useDispatch()
  const adoption = useRef({ applying: false, previousConfig: null, adoptedConfig: null, datasetKey: null, authored: new WeakSet() })
  const wasEditing = useRef(editing)
  const datasetIds = datasetList.map(dataset => dataset.id)
  // A config the client cannot parse is preserved, not authored over.
  // Preserving is the cheapest correct way to handle one case: stored bytes that the current client can't parse.
  const authoring = editing && !widgets.error
  const datasetKey = datasetIds.join(',')
  const initialized = useStore(store, state => state.room.initialized)
  const config = useStore(store, state => state.mosaicDashboard.config)
  const bindings = Object.keys(config.dashboardsById)
  const { sources, readySources } = useWidgetSources({ store, report, initialized, datasetList, tables, files, jobs, localJobs, paramsHash, downloads, setError })

  useEffect(() => {
    if (!initialized || !report) return
    // Redux can echo an earlier local edit while a multi-step upstream action is still running.
    // Only external configurations should replace live charts and their filter clients.
    if (adoption.current.datasetKey === datasetKey && (sameWidgetsConfig(widgets.config, adoption.current.adoptedConfig) || (widgets.config && adoption.current.authored.has(widgets.config)))) return
    adoptWidgetsConfig(store, adoption, widgets.config, datasetIds, datasetKey, authoring, dispatch)
    setConfigRevision(revision => revision + 1)
  }, [initialized, widgets.config, store, report?.id, datasetKey])

  useEffect(() => {
    const enteringEdit = editing && !wasEditing.current
    wasEditing.current = editing
    if (!enteringEdit || !initialized || !report) return
    // Discard view-only chart edits before authoring resumes.
    adoptWidgetsConfig(store, adoption, widgets.config, datasetIds, datasetKey, authoring, dispatch)
    setConfigRevision(revision => revision + 1)
  }, [editing, initialized, report, widgets.config, store])

  useEffect(() => {
    const stop = store.subscribe(state => {
      const tracking = adoption.current
      if (tracking.applying || !state.room.initialized || state.mosaicDashboard.config === tracking.previousConfig) return
      if (!tracking.adoptedConfig && !Object.keys(state.mosaicDashboard.config.dashboardsById).length) return
      tracking.previousConfig = state.mosaicDashboard.config
      if (authoring) {
        const config = serializeWidgetsConfig(state.mosaicDashboard.config, tracking.adoptedConfig)
        publishAuthored(adoption, config, dispatch)
      }
    })
    return stop
  }, [store, authoring, dispatch])

  useEffect(() => {
    // The first eligible dataset gets defaults once. An explicitly empty config stays empty.
    const eligibleDatasetId = autoCreateWidgetIds.find(id => readySources[id]?.physical && tables[id])
    if (initialized && editing && eligibleDatasetId) {
      if (!bindings.includes(eligibleDatasetId) && !widgets.error) suggestWidgets(store, eligibleDatasetId, tables[eligibleDatasetId].fields)
      dispatch(widgetsDefaultsConsumed(eligibleDatasetId))
    }
  }, [initialized, editing, autoCreateWidgetIds, readySources, bindings, tables, store, dispatch, widgets.error])

  const calculating = queryPending || presentationPending || sources.some(source => source.pending || downloads.some(download => download.dataset.id === source.id))

  // painted tracking in snapshots, reported via onSettled
  const paintedPanels = useStore(store, state => state.paintedPanels)
  // Every panel on a dataset still in the report must reach a drawn, failed, or empty end state.
  const settled = Boolean(report) && (Boolean(error || widgets.error) || (initialized && !calculating &&
    (widgets.config?.widgets || [])
      .filter(widget => sources.some(source => source.id === widget.dataId))
      .every(widget => paintedPanels?.[widget.id])))

  useEffect(() => {
    if (onSettled) onSettled(settled)
  }, [onSettled, settled])

  if (!report) return null
  return (
    <RoomShell roomStore={store} className={styles.provider}>
      <RoomShell.DndProvider>
        <aside className={classnames(styles.panel, { [styles.hidden]: !visible, [styles.calculating]: calculating, [styles.snapshot]: snapshot })} aria-label='Report charts' aria-busy={calculating}>
          <div className={styles.calculationLine} role='status' aria-hidden={!calculating} aria-label='Updating charts' data-testid='chart-calculation-line' />
          {widgets.conflict && <div role='alert' className={styles.error}>This report changed in another session. Reload to use the latest saved dashboard.</div>}
          {error || widgets.error ? <div role='alert' className={styles.error}>{error || widgets.error}</div> : <WidgetContents store={store} snapshot={snapshot} sources={sources} loading={!initialized || calculating} dataReloadPending={dataReloadPending} placeholderCount={widgets.config?.widgets?.length || 3} onOpenData={onOpenData} editing={editing} configRevision={configRevision} persistedConfig={widgets.config} onReorder={config => publishAuthored(adoption, config, dispatch)} />}
        </aside>
      </RoomShell.DndProvider>
    </RoomShell>
  )
}
