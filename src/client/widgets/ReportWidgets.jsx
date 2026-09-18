// REVIEW: Own the report-scoped SQLRooms store, synchronize it with persisted dashboards, and infer defaults only for eligible datasets.
import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useStore } from 'zustand'
import { RoomShell } from '@sqlrooms/room-shell'
import { getMosaicDashboardSelectionName } from '@sqlrooms/mosaic'
import WidgetContents from './WidgetContents'
import classnames from 'classnames'
import { QueryJob } from 'dekart-proto/dekart_pb'
import { createWidgetStore, fitWidgetPanels, suggestWidgets, widgetTableName } from './widgetStore'
import { applyWidgetsConfig, parseWidgetsConfig, serializeWidgetsConfig } from './widgetsConfig'
import { getDuckDBRuntime } from '../lib/duckdb/runtime'
import { widgetsChanged, widgetsDefaultsConsumed } from '../actions/widgets'
import styles from './ReportWidgets.module.css'
import './theme.css'
const emptyTables = {}
const sameWidgetsConfig = (left, right) => left === right || (left && right && JSON.stringify(left) === JSON.stringify(right))

function restoreWidgetsConfig (store, persisted) {
  const state = store.getState()
  const dashboardIds = new Set([
    ...Object.keys(state.mosaicDashboard.config.dashboardsById),
    ...Object.keys(persisted?.config?.dashboardsById || {})
  ])
  for (const dashboardId of dashboardIds) {
    state.mosaic.getSelection(getMosaicDashboardSelectionName(dashboardId)).reset()
  }
  applyWidgetsConfig(store, persisted)
}

// The panel is part of a report: Redux/report streams own saved state, SQLRooms owns editing.
export default function ReportWidgets ({ visible, editing, presentationPending, onOpenData }) {
  const [queryPending, setQueryPending] = useState(false)
  const [readySources, setReadySources] = useState({})
  const [error, setError] = useState('')
  const [store] = useState(() => createWidgetStore(setQueryPending, setError))
  const report = useSelector(state => state.report)
  const widgets = useSelector(state => state.widgets)
  const tables = useSelector(state => state.keplerGl.kepler?.visState.datasets || emptyTables)
  const downloads = useSelector(state => state.dataset.downloading)
  const jobs = useSelector(state => state.queryJobs)
  const localJobs = useSelector(state => state.duckDBJobStates)
  const paramsHash = useSelector(state => state.queryParams.hash)
  const datasetList = useSelector(state => state.dataset.list)
  const autoCreateWidgetIds = useSelector(state => state.dataset.autoCreateWidgetIds)
  const dispatch = useDispatch()
  const preparedViews = useRef(new Set())
  const preparedRevisions = useRef(new Map())
  const prepareGeneration = useRef(0)
  const prepareQueue = useRef(Promise.resolve())
  const applying = useRef(false)
  const previousConfig = useRef(null)
  const adoptedConfig = useRef(null)
  const authoredConfigs = useRef(new WeakSet())
  const wasEditing = useRef(editing)
  const initialized = useStore(store, state => state.room.initialized)
  const config = useStore(store, state => state.mosaicDashboard.config)
  const bindings = Object.keys(config.dashboardsById)
  const sources = datasetList.map(dataset => {
    const job = jobs.find(job => job.queryId === dataset.queryId && job.queryParamsHash === paramsHash)
    const localJob = localJobs[job?.id]
    return {
      id: dataset.id,
      label: tables[dataset.id]?.label || dataset.name || 'Dataset',
      fields: tables[dataset.id]?.fields || [],
      physical: readySources[dataset.id]?.physical,
      error: job?.jobError || localJob?.error,
      pending: job && (job.jobStatus !== QueryJob.JobStatus.JOB_STATUS_DONE || (localJob && localJob.status !== 'ready' && localJob.status !== 'error')),
      revision: readySources[dataset.id]?.revision || ''
    }
  })

  useEffect(() => () => {
    prepareGeneration.current++
    const state = store.getState()
    state.mosaicDashboard.clearAllDashboardRuntime()
    state.mosaic.destroyAllClients()
    // Drop only this report's derived views; the report runtime owns source tables and the worker.
    Promise.all([...preparedViews.current].map(view => state.db.connector.query(`DROP VIEW IF EXISTS ${view}`).catch(() => {}))).finally(() => state.room.destroy())
  }, [store])

  useEffect(() => {
    if (!initialized || !report) return
    if (widgets.compatibility === 'opaque') { setError('This dashboard uses unsupported widget settings. Its saved configuration is preserved read-only.'); return }
    // Redux can echo an earlier local edit while a multi-step upstream action is still running.
    // Only external configurations should replace live charts and their filter clients.
    if (sameWidgetsConfig(widgets.config, adoptedConfig.current) || (widgets.config && authoredConfigs.current.has(widgets.config))) return
    applying.current = true
    restoreWidgetsConfig(store, widgets.config)
    for (const dashboardId of Object.keys(widgets.config?.config?.dashboardsById || {})) fitWidgetPanels(store, dashboardId)
    previousConfig.current = store.getState().mosaicDashboard.config
    adoptedConfig.current = widgets.config
    applying.current = false
  }, [initialized, widgets.config, store, report?.id])

  useEffect(() => {
    const enteringEdit = editing && !wasEditing.current
    wasEditing.current = editing
    if (!enteringEdit || !initialized || !report || widgets.compatibility === 'opaque') return
    // Discard view-only chart edits before authoring resumes.
    applying.current = true
    restoreWidgetsConfig(store, widgets.config)
    for (const dashboardId of Object.keys(widgets.config?.config?.dashboardsById || {})) fitWidgetPanels(store, dashboardId)
    previousConfig.current = store.getState().mosaicDashboard.config
    adoptedConfig.current = widgets.config
    applying.current = false
  }, [editing, initialized, report, widgets.config, widgets.compatibility, store])

  useEffect(() => {
    const stop = store.subscribe(state => {
      if (applying.current || !state.room.initialized || state.mosaicDashboard.config === previousConfig.current) return
      if (!adoptedConfig.current && !Object.keys(state.mosaicDashboard.config.dashboardsById).length) return
      previousConfig.current = state.mosaicDashboard.config
      if (editing) {
        const config = serializeWidgetsConfig(state.mosaicDashboard.config, adoptedConfig.current?.initialized)
        if (parseWidgetsConfig(JSON.stringify(config)).compatibility !== 'supported') return
        adoptedConfig.current = config
        authoredConfigs.current.add(config)
        dispatch(widgetsChanged(config))
      }
    })
    return stop
  }, [store, editing, dispatch])

  useEffect(() => {
    if (!initialized || !report) return
    const generation = ++prepareGeneration.current
    const prepare = async () => {
      if (generation !== prepareGeneration.current) return
      const runtime = getDuckDBRuntime(report.id)
      const nextReadySources = {}
      const changedIds = []
      for (const dataset of datasetList) {
        if (generation !== prepareGeneration.current) return
        const source = sources.find(source => source.id === dataset.id)
        if (source?.pending || downloads.some(download => download.dataset.id === dataset.id)) {
          if (readySources[dataset.id]) nextReadySources[dataset.id] = readySources[dataset.id]
          continue
        }
        if (!tables[dataset.id]) continue
        if (tables[dataset.id].fields.some(field => field.name === '__dekart_row')) throw new Error(`Dataset ${dataset.name || dataset.id} uses the reserved chart row field __dekart_row.`)
        const physical = runtime.widgetTable(dataset.id)
        if (!physical) continue
        const revision = runtime.widgetRevision(dataset.id) || physical
        nextReadySources[dataset.id] = { physical, revision }
        if (preparedRevisions.current.get(dataset.id) === revision) continue
        if (readySources[dataset.id]) {
          // Unmount consumers of the previous immutable source before replacing
          // its stable view. Otherwise a retained plot can render a partially
          // invalidated result while its coordinator is being refreshed.
          setReadySources(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== dataset.id)))
          await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
          if (generation !== prepareGeneration.current) return
        }
        const connector = store.getState().db.connector
        await connector.query('CREATE SCHEMA IF NOT EXISTS widgets')
        if (generation !== prepareGeneration.current) return
        // Physical rows are immutable and Kepler reads them in explicit rowid order.
        await connector.query(`CREATE OR REPLACE VIEW ${widgetTableName(dataset.id)} AS SELECT *, rowid AS __dekart_row FROM ${physical} ORDER BY rowid`)
        preparedViews.current.add(widgetTableName(dataset.id))
        changedIds.push(dataset.id)
      }
      if (changedIds.length) {
        if (generation !== prepareGeneration.current) return
        await store.getState().db.refreshTableSchemas()
        if (generation !== prepareGeneration.current) return
        const coordinator = store.getState().mosaic.connection.coordinator
        // Remounted panels issue fresh queries. Clearing only cached results
        // avoids QueryManager.clear rejecting in-flight consumers as "Cleared".
        coordinator.manager.cache().clear()
        changedIds.forEach(id => preparedRevisions.current.set(id, nextReadySources[id].revision))
      }
      if (generation === prepareGeneration.current) { setReadySources(nextReadySources); setError('') }
    }
    const run = prepareQueue.current.catch(() => {}).then(prepare)
    prepareQueue.current = run
    run.catch(error => { if (generation === prepareGeneration.current) setError(`Charts could not load: ${error.message}`) })
    return () => {
      if (generation === prepareGeneration.current) prepareGeneration.current++
    }
  }, [initialized, report?.id, datasetList, downloads, tables, jobs, localJobs, paramsHash, store])

  useEffect(() => {
    // The first eligible dataset gets defaults once. An explicitly empty config stays empty.
    const eligibleDatasetId = autoCreateWidgetIds.find(id => readySources[id]?.physical && tables[id])
    if (initialized && editing && widgets.compatibility === 'supported' && eligibleDatasetId && !bindings.includes(eligibleDatasetId)) {
      suggestWidgets(store, eligibleDatasetId, tables[eligibleDatasetId].fields)
      dispatch(widgetsDefaultsConsumed(eligibleDatasetId))
    }
  }, [initialized, editing, autoCreateWidgetIds, readySources, widgets.compatibility, bindings, tables, store, dispatch])

  const calculating = queryPending || presentationPending || sources.some(source => source.pending || downloads.some(download => download.dataset.id === source.id))

  if (!report) return null
  return (
    <RoomShell roomStore={store} className={styles.provider}>
      <RoomShell.DndProvider>
        <aside className={classnames(styles.panel, { [styles.hidden]: !visible, [styles.calculating]: calculating })} aria-label='Report charts' aria-busy={calculating}>
          <div className={styles.calculationLine} role='status' aria-hidden={!calculating} aria-label='Updating charts' data-testid='chart-calculation-line' />
          {widgets.conflict && <div role='alert' className={styles.error}>This report changed in another session. Reload to use the latest saved dashboard.</div>}
          {error ? <div role='alert' className={styles.error}>{error}</div> : <WidgetContents store={store} sources={sources} loading={!initialized || calculating} placeholderCount={Object.values(widgets.config?.config?.dashboardsById || {}).reduce((count, dashboard) => count + dashboard.panels.length, 0) || 3} onOpenData={onOpenData} editing={editing} />}
        </aside>
      </RoomShell.DndProvider>
    </RoomShell>
  )
}
