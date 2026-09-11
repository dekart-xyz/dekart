import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useStore } from 'zustand'
import { RoomShell } from '@sqlrooms/room-shell'
import { MosaicDashboard, ChartBuilderRoot, ChartBuilderDialogContent, ChartBuilderContent, createMosaicDashboardChartPanelConfig, useMosaicClient, getMosaicDashboardSelectionName, Query } from '@sqlrooms/mosaic'
import { count } from '@uwdata/mosaic-sql'
import { BlockSettingsPanel } from '@sqlrooms/documents'
import { Button } from '@sqlrooms/ui'
import { Plus, ArrowLeft, RotateCcw, X } from 'lucide-react'
import classnames from 'classnames'
import { QueryJob } from 'dekart-proto/dekart_pb'
import { createWidgetStore, chartTypes, suggestWidgets, fitWidgetPanels, widgetTableName } from './widgetStore'
import { getDuckDBRuntime } from '../lib/duckdb/runtime'
import { widgetsChanged } from '../actions/widgets'
import { useWidgetFilters } from './useWidgetFilters'
import styles from './ReportWidgets.module.css'
import './theme.css'
const emptyTables = {}

// The panel is part of a report: Redux/report streams own saved state, SQLRooms owns editing.
export default function ReportWidgets ({ visible, editing, onOpenData }) {
  const [store] = useState(createWidgetStore)
  const [readySources, setReadySources] = useState({})
  const [selected, setSelected] = useState('')
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
  const initialized = useStore(store, state => state.room.initialized)
  const config = useStore(store, state => state.mosaicDashboard.config)
  const bindings = Object.keys(config.dashboardsById)
  const datasetId = selected && tables[selected] ? selected : bindings.find(id => tables[id]) || datasetList.find(dataset => tables[dataset.id])?.id || ''

  const activeDataset = datasetList.find(dataset => dataset.id === datasetId)
  const activeJob = jobs.find(job => job.queryId === activeDataset?.queryId && job.queryParamsHash === paramsHash)
  const localJob = localJobs[activeJob?.id]
  const sourceError = activeJob?.jobError || localJob?.error
  const sourcePending = activeJob && (activeJob.jobStatus !== QueryJob.JobStatus.JOB_STATUS_DONE || (localJob && localJob.status !== 'ready' && localJob.status !== 'error'))

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
    if (widgets.config === adoptedConfig.current) return
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
    if (initialized && editing && visible && datasetId && readySources[datasetId] && !widgets.config && !bindings.length) suggestWidgets(store, datasetId, tables[datasetId].fields)
  }, [initialized, editing, visible, datasetId, readySources, widgets.config, bindings.length, tables, store])

  if (!report) return null
  return (
    <RoomShell roomStore={store} className={styles.provider}>
      <RoomShell.DndProvider>
        <aside className={classnames(styles.panel, { [styles.hidden]: !visible, [styles.viewer]: !editing })} aria-label='Report widgets'>
          <div className={styles.heading}><div><small>DASHBOARD</small><h2>Widgets</h2></div></div>
          <div className={styles.source}><label htmlFor='widget-dataset'>Dataset</label><select id='widget-dataset' value={datasetId} onChange={event => setSelected(event.target.value)}>{datasetList.filter(dataset => tables[dataset.id]).map(dataset => <option key={dataset.id} value={dataset.id}>{tables[dataset.id].label}</option>)}</select></div>
          {widgets.conflict && <div role='alert' className={styles.error}>This report changed in another session. Reload to use the latest saved dashboard.</div>}
          {sourceError ? <div role='alert' className={styles.error}>The dataset query failed. Open Data to fix it.<p>{sourceError}</p>{editing && <Button onClick={onOpenData}>Open data</Button>}</div> : sourcePending ? <div className={styles.empty}><h3>Updating dataset…</h3><p>Widgets will refresh when the query is ready.</p></div> : error ? <div role='alert' className={styles.error}>{error}</div> : datasetId && readySources[datasetId] ? <DatasetWidgets key={`${datasetId}:${readySources[datasetId]}`} store={store} datasetId={datasetId} editing={editing} fields={tables[datasetId].fields} /> : <div className={styles.empty}><h3>{datasetId ? 'Loading dataset…' : 'Your data, in a dashboard'}</h3><p>Upload a file or run a query, then explore it with linked widgets.</p>{editing && <Button onClick={onOpenData}>Open data</Button>}</div>}
        </aside>
      </RoomShell.DndProvider>
    </RoomShell>
  )
}

// Count is a report summary; chart creation and settings are entirely upstream.
function DatasetWidgets ({ store, datasetId, editing, fields }) {
  const [builder, setBuilder] = useState(false)
  const dashboard = useStore(store, state => state.mosaicDashboard.config.dashboardsById[datasetId])
  const settingsOpen = useStore(store, state => state.blockSettings.runtime.isSettingsPanelOpen)
  const table = useStore(store, state => state.db.tables.find(table => table.table.schema === 'widgets' && table.table.table === `d_${datasetId.replaceAll('-', '_')}`))
  const { data, isLoading, error: queryError } = useMosaicClient({ selectionName: getMosaicDashboardSelectionName(datasetId), query: filter => Query.from(widgetTableName(datasetId)).select({ count: count() }).where(filter) })
  const { clauses, clear, error } = useWidgetFilters(store, datasetId, true)
  const rowCount = data?.toArray()[0]?.count
  useEffect(() => { if (!editing) store.getState().blockSettings.requestCloseSettingsPanel() }, [editing, store])
  return (
    <>
      <div className={styles.summary}><span>Matching rows</span><strong data-testid='widget-row-count'>{isLoading ? '…' : rowCount == null ? '—' : Number(rowCount).toLocaleString()}</strong><small>Loaded dataset · filters also apply to the map</small></div>
      {!!clauses.length && <div className={styles.filters}>{clauses.map((clause, index) => <button key={index} onClick={() => clear(clause)}>{clause.meta?.type === 'interval' ? 'Selected range' : Array.isArray(clause.value) ? clause.value.flat().join(', ') : clause.value}<X size={12} /></button>)}<button onClick={() => clauses.forEach(clear)}><RotateCcw size={12} />Clear filters</button></div>}
      {error || queryError ? <div role='alert' className={styles.error}>{error || queryError.message}</div> : editing && settingsOpen ? <div className={styles.settings} data-testid='widget-settings'><Button variant='ghost' onClick={() => store.getState().blockSettings.requestCloseSettingsPanel()}><ArrowLeft size={14} />Back to widgets</Button><BlockSettingsPanel onClose={() => store.getState().blockSettings.requestCloseSettingsPanel()} /></div> : dashboard ? <div className={styles.charts}><MosaicDashboard.Root dashboardId={datasetId} readOnly={!editing}><MosaicDashboard.Panels /></MosaicDashboard.Root></div> : <div className={styles.empty}><h3>No widgets yet</h3><p>Add a category or histogram to explore this dataset.</p></div>}
      {editing && <div className={styles.actions}><Button aria-label='Add widget' onClick={() => setBuilder(true)}><Plus size={15} />Add widget</Button><Button variant='ghost' onClick={() => suggestWidgets(store, datasetId, fields)}>Suggest widgets</Button></div>}
      <ChartBuilderRoot
        open={builder} onOpenChange={setBuilder} tableName={widgetTableName(datasetId)} columns={(table?.columns || []).filter(column => column.name !== '__dekart_row')} chartTypes={chartTypes} onCreateChart={(title, config) => {
          const api = store.getState().mosaicDashboard
          api.ensureDashboard(datasetId, 'Widgets', 'grid')
          api.setSelectedTable(datasetId, `"memory"."widgets"."d_${datasetId.replaceAll('-', '_')}"`)
          api.addPanel(datasetId, createMosaicDashboardChartPanelConfig(title, config))
          fitWidgetPanels(store, datasetId)
          setBuilder(false)
        }}
      ><ChartBuilderDialogContent className={styles.builderDialog} title='Add widget' description='Explore the selected report dataset.'><ChartBuilderContent /></ChartBuilderDialogContent>
      </ChartBuilderRoot>
    </>
  )
}
