import { addDataToMap, replaceDataInMap } from '@kepler.gl/actions'
import { QueryJob } from 'dekart-proto/dekart_pb'
import getDatasetName from '../lib/getDatasetName'
import { buildDuckDBGraph } from '../lib/duckdb/graph'
import { DuckDBJobStatus, isDuckDBDataset } from '../lib/duckdb/constants'
import { getQueryParamsValuesFromSearch } from '../lib/queryParams'
import waitForKeplerDataset from '../lib/waitForKeplerDataset'
import { setError } from './message'
import { keplerDatasetFinishUpdating, keplerDatasetStartUpdating } from './kepler'

let runtimeModule = null

function duckDBDatasets (state) {
  return state.dataset.list.filter(dataset => isDuckDBDataset(dataset, state.queries))
}

// loadDuckDBRuntime keeps DuckDB and its WASM URL graph out of ordinary report bundles.
function loadDuckDBRuntime () {
  if (!runtimeModule) {
    runtimeModule = import('../lib/duckdb/runtime').catch(error => {
      runtimeModule = null
      throw error
    })
  }
  return runtimeModule
}

// duckDBJobStateChanged publishes browser-local execution progress to Redux.
export function duckDBJobStateChanged (jobId, status, error = '', totalRows = 0, datasetId = '') {
  return {
    type: duckDBJobStateChanged.name,
    jobId,
    status,
    error,
    totalRows,
    datasetId
  }
}

// activeDatasetQueryJob returns the canonical job for a dataset and current parameter values.
function activeDatasetQueryJob (state, datasetId) {
  const dataset = state.dataset.list.find(dataset => dataset.id === datasetId)
  return state.queryJobs.find(job =>
    job.queryId === dataset?.queryId &&
    job.queryParamsHash === state.queryParams.hash
  )
}

// getAffectedDatasetIds propagates source changes through the dependency-first graph.
function getAffectedDatasetIds (graph, changedDatasetIds) {
  if (!changedDatasetIds?.length) {
    return new Set(graph.map(node => node.dataset.id))
  }
  const affected = new Set(changedDatasetIds)
  graph.forEach(node => {
    if (node.dependencyIds.some(id => affected.has(id))) {
      affected.add(node.dataset.id)
    }
  })
  return affected
}

// Match the server compiler's alphabetical parameter slots using the last streamed schema.
function duckDBParameterValues (state) {
  const appliedValues = getQueryParamsValuesFromSearch(state.queryParams.url)
  return [...(state.report?.queryParamsList || [])]
    .sort((left, right) => left.name < right.name ? -1 : (left.name > right.name ? 1 : 0))
    .map(parameter => {
      const value = appliedValues[parameter.name]
      return value === undefined || value === '' ? parameter.defaultValue || '' : value
    })
}

function findDuckDBDependencyRevision (revisions, datasetId) {
  return revisions.find(revision => revision.datasetId === datasetId)
}

function externalSourceVersion (state, queryJob, datasetId) {
  const revision = findDuckDBDependencyRevision(queryJob.dependencyRevisionsList, datasetId)
  const pinnedJob = state.queryJobs.find(job => job.id === revision?.queryJobId)
  return revision?.fileSourceId || pinnedJob?.jobResultId || pinnedJob?.id
}

function addDuckDBResultToMap (dispatch, getState, node, result) {
  const state = getState()
  const existing = state.keplerGl.kepler?.visState.datasets?.[node.dataset.id]
  const label = existing?.label || getDatasetName(node.dataset, state.dataset.list, state.files)
  const datasetToUse = {
    info: {
      id: node.dataset.id,
      label,
      format: 'arrow'
    },
    data: {
      dekartArrowTable: result.table,
      dekartTypeMap: result.typeMap
    }
  }
  dispatch(keplerDatasetStartUpdating())
  if (existing) {
    dispatch(replaceDataInMap({
      datasetToReplaceId: node.dataset.id,
      datasetToUse,
      options: {
        keepExistingConfig: true,
        centerMap: false
      }
    }))
  } else {
    dispatch(addDataToMap({ datasets: datasetToUse }))
  }
  dispatch(keplerDatasetFinishUpdating())
  return existing
}

// invalidateDuckDBResultInMap clears stale rows while retaining layers, filters, and tooltips.
function invalidateDuckDBResultInMap (dispatch, getState, datasetId, queryJobId = activeDatasetQueryJob(getState(), datasetId)?.id) {
  const existing = getState().keplerGl.kepler?.visState.datasets?.[datasetId]
  if (existing && existing.dataContainer.numRows() > 0) {
    const emptyTable = existing.dataContainer.getTable().slice(0, 0)
    addDuckDBResultToMap(dispatch, getState, {
      dataset: { id: datasetId },
      queryJob: queryJobId ? { id: queryJobId } : null
    }, { table: emptyTable })
  }
}

function invalidateDuckDBNodeResult (dispatch, getState, node, queryJobId) {
  if (node.publish) {
    invalidateDuckDBResultInMap(dispatch, getState, node.dataset.id, queryJobId)
  }
}

// markDuckDBNodeUnavailable clears published rows before recording an unavailable job.
function markDuckDBNodeUnavailable (dispatch, getState, node, queryJobId, status, error = '') {
  invalidateDuckDBNodeResult(dispatch, getState, node, queryJobId)
  dispatch(duckDBJobStateChanged(queryJobId, status, error))
}

function publishRuntimeLoadError (dispatch, getState, datasets, error, expectedReportId) {
  if (getState().report?.id !== expectedReportId) {
    return
  }
  const jobError = `DuckDB runtime failed to load: ${error.message}`
  dispatch(setError(new Error(jobError)))
  for (const dataset of datasets) {
    invalidateDuckDBResultInMap(dispatch, getState, dataset.id)
    const queryJob = activeDatasetQueryJob(getState(), dataset.id)
    if (queryJob) {
      dispatch(duckDBJobStateChanged(
        queryJob.id,
        DuckDBJobStatus.DUCKDB_JOB_STATUS_ERROR,
        jobError
      ))
    }
  }
}

// registerDuckDBSource adopts the native source table already displayed by Kepler.
export function registerDuckDBSource (dataset, tableName, version, expectedReportId) {
  return async (dispatch, getState) => {
    const reportId = getState().report?.id
    if (!reportId || reportId !== expectedReportId) {
      return false
    }
    let getDuckDBRuntime
    try {
      ({ getDuckDBRuntime } = await loadDuckDBRuntime())
    } catch (error) {
      publishRuntimeLoadError(dispatch, getState, duckDBDatasets(getState()), error, reportId)
      return false
    }
    if (getState().report?.id !== reportId) {
      return false
    }
    const runtime = getDuckDBRuntime(reportId)
    await runtime.registerNativeSource(dataset.id, tableName, version)
    if (getState().report?.id !== reportId) {
      await runtime.removeSource(dataset.id)
      return true
    }
    // Ordinary reports still register ownership for cleanup but have no graph to rerun.
    if (duckDBDatasets(getState()).length > 0) {
      dispatch(runDuckDBGraph([dataset.id]))
    }
    return true
  }
}

// registerDuckDBFileSource preserves schema for an empty downloaded dataset that Kepler cannot display.
export function registerDuckDBFileSource (dataset, file, extension, version, expectedReportId) {
  return async (dispatch, getState) => {
    if (duckDBDatasets(getState()).length === 0) {
      return
    }
    const reportId = getState().report?.id
    if (!reportId || reportId !== expectedReportId) {
      return false
    }
    let getDuckDBRuntime
    try {
      ({ getDuckDBRuntime } = await loadDuckDBRuntime())
    } catch (error) {
      publishRuntimeLoadError(dispatch, getState, duckDBDatasets(getState()), error, reportId)
      return false
    }
    if (getState().report?.id !== reportId) {
      return false
    }
    const runtime = getDuckDBRuntime(reportId)
    await runtime.registerFileSource(dataset.id, file, extension, version)
    if (getState().report?.id !== reportId) {
      await runtime.removeSource(dataset.id)
      return true
    }
    dispatch(runDuckDBGraph([dataset.id]))
    return true
  }
}

// runDuckDBGraph materializes ready canonical jobs entirely inside the current browser.
export function runDuckDBGraph (changedDatasetIds = null) {
  return async (dispatch, getState) => {
    const initialState = getState()
    const reportId = initialState.report?.id
    const reportDuckDBDatasets = duckDBDatasets(initialState)
    if (!reportId || reportDuckDBDatasets.length === 0) {
      return
    }
    let getDuckDBRuntime
    try {
      ({ getDuckDBRuntime } = await loadDuckDBRuntime())
    } catch (error) {
      publishRuntimeLoadError(dispatch, getState, reportDuckDBDatasets, error, reportId)
      return
    }
    const runtime = getDuckDBRuntime(reportId)
    // A newer generation cancels this run; report identity blocks late work after navigation.
    const generation = runtime.nextGeneration()
    const executionIsCurrent = () => runtime.isCurrent(generation) && getState().report?.id === reportId
    let graph = []
    try {
      const executionState = getState()
      if (!executionIsCurrent()) {
        return
      }
      // Build the server-compiled graph for the current parameter values.
      graph = buildDuckDBGraph({
        datasets: executionState.dataset.list,
        queries: executionState.queries,
        queryJobs: executionState.queryJobs,
        queryParamsHash: executionState.queryParams.hash
      })
      const parameterValues = duckDBParameterValues(executionState)
      // Cleanup shares the execution lock so it cannot drop tables while another run is executing.
      const releaseCleanup = await runtime.acquireExecution()
      try {
        if (!executionIsCurrent()) {
          return
        }
        await runtime.discardJobTables(graph.map(node => node.queryJob.id))
      } finally {
        releaseCleanup()
      }
      const affected = getAffectedDatasetIds(graph, changedDatasetIds)
      const acceptedState = getState()

      // Materialize changed descendants and unfinished jobs in dependency order.
      for (const node of graph) {
        const acceptedJobState = acceptedState.duckDBJobStates[node.queryJob?.id]
        if (!affected.has(node.dataset.id) &&
          acceptedJobState?.status === DuckDBJobStatus.DUCKDB_JOB_STATUS_READY) {
          continue
        }
        const state = getState()
        if (!executionIsCurrent()) {
          return
        }
        const queryJob = state.queryJobs.find(job => job.id === node.queryJob?.id) || node.queryJob
        if (!queryJob) {
          continue
        }
        node.queryJob = queryJob
        if (queryJob.jobStatus === QueryJob.JobStatus.JOB_STATUS_UNSPECIFIED && queryJob.jobError) {
          markDuckDBNodeUnavailable(
            dispatch,
            getState,
            node,
            queryJob.id,
            DuckDBJobStatus.DUCKDB_JOB_STATUS_ERROR,
            queryJob.jobError
          )
          continue
        }
        if (queryJob.jobStatus !== QueryJob.JobStatus.JOB_STATUS_DONE) {
          dispatch(duckDBJobStateChanged(
            queryJob.id,
            DuckDBJobStatus.DUCKDB_JOB_STATUS_WAITING_FOR_SOURCES
          ))
          continue
        }
        const failedExternalDependency = node.dependencyIds.find(id => {
          const dependency = state.dataset.list.find(dataset => dataset.id === id)
          if (isDuckDBDataset(dependency, state.queries) || !dependency.queryId) {
            return false
          }
          const revision = findDuckDBDependencyRevision(queryJob.dependencyRevisionsList, id)
          return state.queryJobs.find(job => job.id === revision?.queryJobId)?.jobError
        })
        if (failedExternalDependency) {
          const dependency = state.dataset.list.find(dataset => dataset.id === failedExternalDependency)
          const revision = findDuckDBDependencyRevision(queryJob.dependencyRevisionsList, failedExternalDependency)
          const sourceQueryJob = state.queryJobs.find(job => job.id === revision?.queryJobId)
          const error = `Upstream dataset "${getDatasetName(dependency, state.dataset.list, state.files)}" failed: ${sourceQueryJob.jobError}`
          markDuckDBNodeUnavailable(
            dispatch,
            getState,
            node,
            queryJob.id,
            DuckDBJobStatus.DUCKDB_JOB_STATUS_ERROR,
            error
          )
          continue
        }
        const pendingExternalDependency = node.dependencyIds.find(id => {
          const dependency = state.dataset.list.find(dataset => dataset.id === id)
          if (isDuckDBDataset(dependency, state.queries) || !dependency.queryId) {
            return false
          }
          const revision = findDuckDBDependencyRevision(queryJob.dependencyRevisionsList, id)
          const pinnedQueryJob = state.queryJobs.find(job => job.id === revision?.queryJobId)
          return pinnedQueryJob && !(
            pinnedQueryJob.jobStatus === QueryJob.JobStatus.JOB_STATUS_DONE ||
            (
              pinnedQueryJob.jobStatus === QueryJob.JobStatus.JOB_STATUS_DONE_LEGACY &&
              Boolean(pinnedQueryJob.jobResultId)
            )
          )
        })
        // Parameter refresh waits for fresh warehouse results instead of publishing stale derived data.
        if (pendingExternalDependency) {
          markDuckDBNodeUnavailable(
            dispatch,
            getState,
            node,
            queryJob.id,
            DuckDBJobStatus.DUCKDB_JOB_STATUS_WAITING_FOR_SOURCES
          )
          continue
        }
        const missingSource = node.dependencyIds.find(id => {
          const dependency = state.dataset.list.find(dataset => dataset.id === id)
          if (isDuckDBDataset(dependency, state.queries)) {
            return false
          }
          return !runtime.hasSource(id, externalSourceVersion(state, queryJob, id))
        })
        if (missingSource) {
          const expectedVersion = externalSourceVersion(state, queryJob, missingSource)
          const sourceError = runtime.sourceError(missingSource, expectedVersion)
          const source = state.dataset.list.find(dataset => dataset.id === missingSource)
          markDuckDBNodeUnavailable(
            dispatch,
            getState,
            node,
            queryJob.id,
            sourceError
              ? DuckDBJobStatus.DUCKDB_JOB_STATUS_ERROR
              : DuckDBJobStatus.DUCKDB_JOB_STATUS_WAITING_FOR_SOURCES,
            sourceError ? `Upstream dataset "${getDatasetName(source, state.dataset.list, state.files)}" failed: ${sourceError}` : ''
          )
          continue
        }
        const failedDependency = node.duckDBDependencyIds.find(id => {
          const revision = findDuckDBDependencyRevision(queryJob.dependencyRevisionsList, id)
          return getState().duckDBJobStates[revision?.queryJobId]?.status ===
            DuckDBJobStatus.DUCKDB_JOB_STATUS_ERROR
        })
        if (failedDependency) {
          const dependency = state.dataset.list.find(dataset => dataset.id === failedDependency)
          markDuckDBNodeUnavailable(
            dispatch,
            getState,
            node,
            queryJob.id,
            DuckDBJobStatus.DUCKDB_JOB_STATUS_ERROR,
            `Upstream DuckDB dataset "${getDatasetName(dependency, state.dataset.list, state.files)}" failed.`
          )
          continue
        }
        // A downstream node waits until every DuckDB dependency has published successfully.
        const incompleteDependency = node.duckDBDependencyIds.find(id => {
          const revision = findDuckDBDependencyRevision(queryJob.dependencyRevisionsList, id)
          return getState().duckDBJobStates[revision?.queryJobId]?.status !==
            DuckDBJobStatus.DUCKDB_JOB_STATUS_READY
        })
        if (incompleteDependency) {
          markDuckDBNodeUnavailable(
            dispatch,
            getState,
            node,
            queryJob.id,
            DuckDBJobStatus.DUCKDB_JOB_STATUS_WAITING_FOR_SOURCES
          )
          continue
        }
        try {
          let result
          const releaseExecution = await runtime.acquireExecution()
          try {
            if (!executionIsCurrent()) {
              return
            }
            // Keep dependency rebinding and execution under one lock so pinned sources cannot change mid-query.
            for (const dependencyId of node.dependencyIds) {
              const dependency = state.dataset.list.find(dataset => dataset.id === dependencyId)
              if (!isDuckDBDataset(dependency, state.queries)) {
                const expectedVersion = externalSourceVersion(state, queryJob, dependencyId)
                if (!await runtime.registerSource(dependencyId, expectedVersion)) {
                  throw new Error(`Upstream source revision ${expectedVersion} is no longer available.`)
                }
              }
            }
            for (const dependencyId of node.duckDBDependencyIds) {
              const revision = findDuckDBDependencyRevision(queryJob.dependencyRevisionsList, dependencyId)
              if (!await runtime.registerDuckDBResult(dependencyId, revision.queryJobId)) {
                throw new Error(`Upstream DuckDB job ${revision.queryJobId} is no longer available.`)
              }
            }
            dispatch(duckDBJobStateChanged(
              queryJob.id,
              DuckDBJobStatus.DUCKDB_JOB_STATUS_RUNNING
            ))
            result = await runtime.executeNode(node, parameterValues)
          } finally {
            releaseExecution()
          }
          const activeJob = activeDatasetQueryJob(getState(), node.dataset.id)
          // Only published roots must still be active; descendants may pin historical intermediate jobs.
          if (!executionIsCurrent() || (node.publish && activeJob?.id !== queryJob.id)) {
            return
          }
          if (node.publish) {
            const previousKeplerDataset = addDuckDBResultToMap(dispatch, getState, node, result)
            const published = await waitForKeplerDataset(
              getState,
              node.dataset.id,
              previousKeplerDataset,
              result.totalRows,
              executionIsCurrent
            )
            if (!published) return
          }
          if (!executionIsCurrent()) {
            return
          }
          dispatch(duckDBJobStateChanged(
            queryJob.id,
            DuckDBJobStatus.DUCKDB_JOB_STATUS_READY,
            '',
            result.totalRows,
            node.dataset.id
          ))
        } catch (error) {
          if (!executionIsCurrent()) {
            return
          }
          dispatch(setError(error))
          markDuckDBNodeUnavailable(
            dispatch,
            getState,
            node,
            queryJob.id,
            DuckDBJobStatus.DUCKDB_JOB_STATUS_ERROR,
            error.message
          )
        }
      }
    } catch (error) {
      if (!executionIsCurrent()) {
        return
      }
      dispatch(setError(error))
      for (const node of graph) {
        invalidateDuckDBNodeResult(dispatch, getState, node, node.queryJob?.id)
        if (node.queryJob) {
          dispatch(duckDBJobStateChanged(
            node.queryJob.id,
            DuckDBJobStatus.DUCKDB_JOB_STATUS_ERROR,
            error.message
          ))
        }
      }
    }
  }
}

// failDuckDBSource records the source failure; graph execution propagates it to descendants.
export function failDuckDBSource (sourceDatasetId, sourceError, { downloadController, sourceVersion } = {}) {
  return async (dispatch, getState) => {
    const downloadIsCurrent = () => !downloadController ||
      getState().dataset.downloading.some(item => item.controller === downloadController)
    const initialState = getState()
    const reportId = initialState.report?.id
    if (!reportId || !downloadIsCurrent() || duckDBDatasets(initialState).length === 0) {
      return
    }
    let getDuckDBRuntime
    try {
      ({ getDuckDBRuntime } = await loadDuckDBRuntime())
    } catch (error) {
      if (downloadIsCurrent()) {
        publishRuntimeLoadError(dispatch, getState, duckDBDatasets(initialState), error, reportId)
      }
      return
    }
    if (getState().report?.id !== reportId || !downloadIsCurrent()) {
      return
    }
    const runtime = getDuckDBRuntime(reportId)
    const releaseExecution = await runtime.acquireExecution()
    if (!downloadIsCurrent()) {
      releaseExecution()
      return
    }
    const generation = runtime.nextGeneration()
    try {
      if (!runtime.isCurrent(generation) || getState().report?.id !== reportId || !downloadIsCurrent()) {
        return
      }
      const download = downloadController && getState().dataset.downloading.find(item =>
        item.controller === downloadController
      )
      await runtime.failSource(sourceDatasetId, sourceError, sourceVersion || download?.sourceId)
    } finally {
      releaseExecution()
    }
    if (getState().report?.id === reportId && runtime.isCurrent(generation) && downloadIsCurrent()) {
      dispatch(runDuckDBGraph([sourceDatasetId]))
    }
  }
}

export function closeDuckDBReport () {
  return async (_dispatch, getState) => {
    const reportId = getState().report?.id
    // Avoid loading the runtime just to close an ordinary report.
    const loadedRuntimeModule = runtimeModule
    if (loadedRuntimeModule && reportId) {
      const { closeDuckDBRuntime } = await loadedRuntimeModule
      closeDuckDBRuntime(reportId)
    }
  }
}

export function removeDuckDBSource (datasetId) {
  return async (_dispatch, getState) => {
    const reportId = getState().report?.id
    const loadedRuntimeModule = runtimeModule
    if (!loadedRuntimeModule || !reportId) {
      return
    }
    const { removeDuckDBRuntimeSource } = await loadedRuntimeModule
    await removeDuckDBRuntimeSource(reportId, datasetId)
  }
}
