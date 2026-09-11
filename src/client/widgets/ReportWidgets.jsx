import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useStore } from 'zustand'
import { RoomShell } from '@sqlrooms/room-shell'
import { Button } from '@sqlrooms/ui'
import WidgetContents from './WidgetContents'
import classnames from 'classnames'
import { QueryJob } from 'dekart-proto/dekart_pb'
import { createWidgetStore, suggestWidgets, widgetTableName } from './widgetStore'
import { getDuckDBRuntime } from '../lib/duckdb/runtime'
import { widgetsChanged } from '../actions/widgets'
import styles from './ReportWidgets.module.css'
import './theme.css'
const emptyTables = {}

// The panel is part of a report: Redux/report streams own saved state, SQLRooms owns editing.
export default function ReportWidgets ({ visible, editing, onOpenData }) {
  const [store] = useState(createWidgetStore)
  const [readySources, setReadySources] = useState({})
  const [error, setError] = useState('')
  const report = useSelector(state => state.report)
  const widgets = useSelector(state => state.widgets)
  const tables = useSelector(state => state.keplerGl.kepler?.visState.datasets || emptyTables)
  const downloads = useSelector(state => state.dataset.downloading)
  const jobs = useSelector(state => state.queryJobs)
  const localJobs = useSelector(state => state.duckDBJobStates)
  const paramsHash = useSelector(state => state.queryParams.hash)
  const datasetList = useSelector(state => state.dataset.list)
  const dispatch = useDispatch()
  const preparedViews = useRef(new Set())
  const applying = useRef(false)
  const previousConfig = useRef(null)
  const adoptedConfig = useRef(null)
  const authoredConfigs = useRef(new WeakSet())
  const initialized = useStore(store, state => state.room.initialized)
  const config = useStore(store, state => state.mosaicDashboard.config)
  const bindings = Object.keys(config.dashboardsById)
  const datasetId = datasetList.find(dataset => readySources[dataset.id])?.id || ''
  const sources = datasetList.map(dataset => {
    const job = jobs.find(job => job.queryId === dataset.queryId && job.queryParamsHash === paramsHash)
    const localJob = localJobs[job?.id]
    return {
      id: dataset.id,
      label: tables[dataset.id]?.label || dataset.name || 'Dataset',
      fields: tables[dataset.id]?.fields || [],
      physical: readySources[dataset.id],
      error: job?.jobError || localJob?.error,
      pending: job && (job.jobStatus !== QueryJob.JobStatus.JOB_STATUS_DONE || (localJob && localJob.status !== 'ready' && localJob.status !== 'error'))
    }
  })

  useEffect(() => () => {
    const state = store.getState()
    state.mosaicDashboard.clearAllDashboardRuntime()
    state.mosaic.destroyAllClients()
    // Drop only this report's derived views; the report runtime owns source tables and the worker.
    Promise.all([...preparedViews.current].map(view => state.db.connector.query(`DROP VIEW IF EXISTS ${view}`).catch(() => {}))).finally(() => state.room.destroy())
  }, [store])

  useEffect(() => {
    if (!initialized || !report) return
    if (widgets.config && widgets.config.version !== 1) { setError('This dashboard uses a newer widget format. Its configuration is preserved.'); return }
    // Redux can echo an earlier local edit while a multi-step upstream action is still running.
    // Only external configurations should replace live charts and their filter clients.
    if (widgets.config === adoptedConfig.current || (widgets.config && authoredConfigs.current.has(widgets.config))) return
    applying.current = true
    store.getState().mosaicDashboard.clearAllDashboardRuntime()
    store.getState().mosaicDashboard.setConfig(widgets.config?.config || { dashboardsById: {} })
    previousConfig.current = store.getState().mosaicDashboard.config
    adoptedConfig.current = widgets.config
    applying.current = false
  }, [initialized, widgets.config, store, report?.id])

  useEffect(() => {
    const stop = store.subscribe(state => {
      if (applying.current || !state.room.initialized || state.mosaicDashboard.config === previousConfig.current) return
      if (!adoptedConfig.current && !Object.keys(state.mosaicDashboard.config.dashboardsById).length) return
      previousConfig.current = state.mosaicDashboard.config
      if (editing) {
        const config = { version: 1, provider: 'sqlrooms', initialized: true, config: state.mosaicDashboard.config }
        adoptedConfig.current = config
        authoredConfigs.current.add(config)
        dispatch(widgetsChanged(config))
      }
    })
    return stop
  }, [store, editing, dispatch])

  useEffect(() => {
    if (!initialized || !report) return
    let alive = true
    const prepare = async () => {
      const runtime = getDuckDBRuntime(report.id)
      const sources = {}
      for (const dataset of datasetList) {
        if (!tables[dataset.id] || downloads.some(download => download.dataset.id === dataset.id)) continue
        const physical = runtime.widgetTable(dataset.id)
        if (!physical) continue
        sources[dataset.id] = physical
        if (readySources[dataset.id] === physical) continue
        const connector = store.getState().db.connector
        await connector.query('CREATE SCHEMA IF NOT EXISTS widgets')
        // Physical rows are immutable and Kepler reads them in explicit rowid order.
        await connector.query(`CREATE OR REPLACE VIEW ${widgetTableName(dataset.id)} AS SELECT *, rowid AS __dekart_row FROM ${physical} ORDER BY rowid`)
        sources[dataset.id] = physical
        preparedViews.current.add(widgetTableName(dataset.id))
      }
      const changed = Object.keys(sources).some(id => sources[id] !== readySources[id])
      if (changed) {
        await store.getState().db.refreshTableSchemas()
        const coordinator = store.getState().mosaic.connection.coordinator
        coordinator.clear({ clients: false, cache: true })
        coordinator.clients.forEach(client => client.requestQuery())
      }
      if (alive) { setReadySources(sources); setError('') }
    }
    prepare().catch(error => { if (alive) setError(`Widgets could not load: ${error.message}`) })
    return () => { alive = false }
  }, [initialized, report?.id, datasetList, downloads, tables, store])

  useEffect(() => {
    // The first eligible dataset gets defaults once. An explicitly empty config stays empty.
    if (initialized && editing && visible && datasetId && tables[datasetId] && readySources[datasetId] && !widgets.config && !bindings.length) suggestWidgets(store, datasetId, tables[datasetId].fields)
  }, [initialized, editing, visible, datasetId, readySources, widgets.config, bindings.length, tables, store])

  if (!report) return null
  return (
    <RoomShell roomStore={store} className={styles.provider}>
      <RoomShell.DndProvider>
        <aside className={classnames(styles.panel, { [styles.hidden]: !visible, [styles.viewer]: !editing })} aria-label='Report widgets'>
          {widgets.conflict && <div role='alert' className={styles.error}>This report changed in another session. Reload to use the latest saved dashboard.</div>}
          {error ? <div role='alert' className={styles.error}>{error}</div> : sources.some(source => source.physical) || bindings.length ? <WidgetContents store={store} sources={sources} editing={editing} onOpenData={onOpenData} /> : <div className={styles.empty}><h3>Load data to add widgets</h3><p>Upload a file or run a query.</p>{editing && <Button onClick={onOpenData}>Open data</Button>}</div>}
        </aside>
      </RoomShell.DndProvider>
    </RoomShell>
  )
}
