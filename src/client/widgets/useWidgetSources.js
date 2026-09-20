// what each dataset looks like right now, and the DuckDB views the charts read from.
import { useEffect, useRef, useState } from 'react'
import { QueryJob } from 'dekart-proto/dekart_pb'
import { getDuckDBRuntime } from '../lib/duckdb/runtime'
import { widgetTableName } from './widgetStore'

// A dataset is still moving if its query has not finished, if its local DuckDB job
// has not settled, or if its data is being downloaded into the browser.
function sourcePending (dataset, jobs, localJobs, paramsHash) {
  const job = jobs.find(job => job.queryId === dataset.queryId && job.queryParamsHash === paramsHash)
  const localJob = localJobs[job?.id]
  const pending = job && (job.jobStatus !== QueryJob.JobStatus.JOB_STATUS_DONE || (localJob && localJob.status !== 'ready' && localJob.status !== 'error'))
  return { pending, error: job?.jobError || localJob?.error }
}

// The panel's view of one dataset: its label and fields come from Kepler, its
// physical table and revision from the report's DuckDB runtime once prepared.
function describeSources (datasetList, tables, readySources, downloads, jobs, localJobs, paramsHash) {
  return datasetList.map(dataset => {
    const { pending, error } = sourcePending(dataset, jobs, localJobs, paramsHash)
    return {
      id: dataset.id,
      label: tables[dataset.id]?.label || dataset.name || 'Dataset',
      fields: tables[dataset.id]?.fields || [],
      physical: readySources[dataset.id]?.physical,
      error,
      pending,
      downloading: downloads.some(download => download.dataset.id === dataset.id),
      revision: readySources[dataset.id]?.revision || ''
    }
  })
}

// Wait two frames so React has committed the unmount of the previous consumers
// before the view underneath them is replaced.
function afterUnmountPainted () {
  return new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
}

// Point `widgets.d_<dataset>` at the dataset's current immutable physical table.
// Charts always query the stable view name, so a data reload swaps the target
// underneath them instead of forcing every chart spec to be rewritten.
async function createWidgetView (store, datasetId, physical, preparedViews) {
  const connector = store.getState().db.connector
  await connector.query('CREATE SCHEMA IF NOT EXISTS widgets')
  await connector.query(`CREATE OR REPLACE VIEW ${widgetTableName(datasetId)} AS SELECT * FROM ${physical}`)
  preparedViews.current.add(widgetTableName(datasetId))
}

// Tell Mosaic that the tables behind the views changed. Only cached results are
// dropped: QueryManager.clear would reject in-flight consumers as "Cleared".
async function refreshMosaicAfterViewChange (store) {
  await store.getState().db.refreshTableSchemas()
  store.getState().mosaic.connection.coordinator.manager.cache().clear()
}

// Bring every dataset's widget view up to date with the runtime, one dataset at a
// time. Each pass carries a generation stamp; any await can be overtaken by a newer
// pass, so the stamp is re-checked after every await and a stale pass exits without
// touching shared state.
async function prepareWidgetViews (context, generation) {
  const { store, report, datasetList, tables, downloads, jobs, localJobs, paramsHash, readySources, setReadySources, preparedViews, preparedRevisions, prepareGeneration } = context
  const current = () => generation === prepareGeneration.current
  const runtime = getDuckDBRuntime(report.id)
  const nextReadySources = {}
  const changedIds = []
  for (const dataset of datasetList) {
    if (!current()) return
    const { pending } = sourcePending(dataset, jobs, localJobs, paramsHash)
    if (pending || downloads.some(download => download.dataset.id === dataset.id)) {
      // Still loading: keep serving the previous revision rather than blanking the charts.
      if (readySources[dataset.id]) nextReadySources[dataset.id] = readySources[dataset.id]
      continue
    }
    if (!tables[dataset.id]) continue
    const physical = runtime.widgetTable(dataset.id)
    if (!physical) continue
    const revision = runtime.widgetRevision(dataset.id) || physical
    nextReadySources[dataset.id] = { physical, revision }
    if (preparedRevisions.current.get(dataset.id) === revision) continue
    if (readySources[dataset.id]) {
      // Unmount consumers of the previous immutable source before replacing its
      // stable view. Otherwise a retained plot can render a partially invalidated
      // result while its coordinator is being refreshed.
      setReadySources(sources => Object.fromEntries(Object.entries(sources).filter(([id]) => id !== dataset.id)))
      await afterUnmountPainted()
      if (!current()) return
    }
    await createWidgetView(store, dataset.id, physical, preparedViews)
    if (!current()) return
    changedIds.push(dataset.id)
  }
  if (changedIds.length) {
    await refreshMosaicAfterViewChange(store)
    if (!current()) return
    changedIds.forEach(id => preparedRevisions.current.set(id, nextReadySources[id].revision))
  }
  if (!current()) return
  setReadySources(nextReadySources)
  return true
}

// Drop only this report's derived views on unmount; the report runtime owns the
// source tables and the shared worker and outlives the panel.
function dropWidgetViews (store, preparedViews) {
  const state = store.getState()
  state.mosaicDashboard.clearAllDashboardRuntime()
  state.mosaic.destroyAllClients()
  Promise.all([...preparedViews.current].map(view => state.db.connector.query(`DROP VIEW IF EXISTS ${view}`).catch(() => {}))).finally(() => state.room.destroy())
}

// Keep the widget views in step with the report's datasets and return what the
// panel should render for each one.
export default function useWidgetSources ({ store, report, initialized, datasetList, tables, jobs, localJobs, paramsHash, downloads, setError }) {
  const [readySources, setReadySources] = useState({})
  const preparedViews = useRef(new Set())
  const preparedRevisions = useRef(new Map())
  const prepareGeneration = useRef(0)
  // Passes are serialized: DuckDB DDL and Mosaic cache invalidation must not interleave.
  const prepareQueue = useRef(Promise.resolve())

  useEffect(() => () => {
    prepareGeneration.current++
    dropWidgetViews(store, preparedViews)
  }, [store])

  useEffect(() => {
    if (!initialized || !report) return
    const generation = ++prepareGeneration.current
    const context = { store, report, datasetList, tables, downloads, jobs, localJobs, paramsHash, readySources, setReadySources, preparedViews, preparedRevisions, prepareGeneration }
    const run = prepareQueue.current.catch(() => {}).then(async () => {
      if (generation !== prepareGeneration.current) return
      if (await prepareWidgetViews(context, generation)) setError('')
    })
    prepareQueue.current = run
    run.catch(error => { if (generation === prepareGeneration.current) setError(`Charts could not load: ${error.message}`) })
    // Invalidate this pass when the inputs change, unless a newer pass already did.
    return () => {
      if (generation === prepareGeneration.current) prepareGeneration.current++
    }
  }, [initialized, report?.id, datasetList, downloads, tables, jobs, localJobs, paramsHash, store])

  return { sources: describeSources(datasetList, tables, readySources, downloads, jobs, localJobs, paramsHash), readySources }
}
