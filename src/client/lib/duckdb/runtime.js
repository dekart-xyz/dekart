import * as duckdb from '@duckdb/duckdb-wasm'
import { Table } from 'apache-arrow'
import {
  castDuckDBTypesForKepler,
  getDuckDBColumnTypesMap,
  setGeoArrowWKBExtension
} from '@kepler.gl/duckdb'
import { duckDBViewName } from './constants'
import { getColumnTypes, getSharedDuckDB, loadDuckDBExtension, quoteIdentifier, sourceReaderSQL } from './database'

function duckDBJobTableName (jobId) {
  return `job_${jobId.replaceAll('-', '_')}`
}

class DuckDBReportRuntime {
  constructor (reportId, predecessorCleanup = Promise.resolve()) {
    this.reportId = reportId
    this.predecessorCleanup = predecessorCleanup
    this.generation = 0
    this.nativeSources = new Map()
    this.fileSources = new Map()
    this.sourceErrors = new Map()
    this.registeredSourceVersions = new Map()
    this.registeredSourceFiles = new Map()
    this.nativeTables = new Set()
    this.jobTables = new Set()
    this.ownedViews = new Set()
    this.initializing = null
    this.db = null
    this.connection = null
    this.closed = false
    this.execution = Promise.resolve()
  }

  // initialize starts the report-local worker only after a DuckDB dataset needs it.
  async initialize () {
    this.assertOpen()
    if (this.connection) {
      return
    }
    if (this.initializing) {
      return this.initializing
    }
    this.initializing = (async () => {
      try {
        // Stable report views are reused in one database only after the prior report is cleaned up.
        await this.predecessorCleanup
        this.assertOpen()
        this.db = await getSharedDuckDB()
        this.assertOpen()
        this.connection = await this.db.connect()
        this.assertOpen()
        for (const extension of ['spatial', 'parquet', 'json', 'h3']) {
          await loadDuckDBExtension(this.connection, extension)
        }
        await this.connection.query('CREATE SCHEMA IF NOT EXISTS datasets')
        await this.connection.query('CREATE SCHEMA IF NOT EXISTS dekart_internal')
      } catch (error) {
        await this.releaseResources()
        throw error
      }
    })()
    const initializing = this.initializing
    try {
      return await initializing
    } catch (error) {
      // Permit a later run to recover from a transient worker or asset failure.
      if (this.initializing === initializing) {
        this.initializing = null
      }
      throw error
    }
  }

  assertOpen () {
    if (this.closed) {
      throw new Error('DuckDB runtime was closed.')
    }
  }

  async releaseResources () {
    if (!this.connection && (this.nativeTables.size || this.ownedViews.size)) {
      this.db = await getSharedDuckDB().catch(() => null)
      this.connection = await this.db?.connect().catch(() => null)
    }
    if (this.connection) {
      for (const view of [...this.ownedViews].reverse()) {
        await this.connection.query(`DROP VIEW IF EXISTS datasets.${quoteIdentifier(view)}`).catch(() => {})
      }
      for (const table of this.jobTables) {
        await this.connection.query(`DROP TABLE IF EXISTS dekart_internal.${quoteIdentifier(table)}`).catch(() => {})
      }
      for (const table of this.nativeTables) {
        await this.connection.query(`DROP TABLE IF EXISTS main.${quoteIdentifier(table)}`).catch(() => {})
      }
      await this.connection.close().catch(() => {})
    }
    if (this.db) {
      for (const fileName of this.registeredSourceFiles.values()) {
        await this.db.dropFile(fileName).catch(() => {})
      }
    }
    this.ownedViews.clear()
    this.jobTables.clear()
    this.nativeTables.clear()
    this.registeredSourceFiles.clear()
    this.connection = null
    this.db = null
  }

  // registerNativeSource adopts the table already used by Kepler for an immutable revision.
  async registerNativeSource (datasetId, tableName, version) {
    const release = await this.acquireExecution()
    try {
      const previous = this.nativeSources.get(datasetId)
      const registeredVersion = this.registeredSourceVersions.get(datasetId)
      if (registeredVersion) {
        await this.initialize()
        const viewName = duckDBViewName(datasetId)
        // Move an existing file or native alias to the source Kepler now displays.
        await this.connection.query(
          `CREATE OR REPLACE VIEW datasets.${quoteIdentifier(viewName)} AS SELECT * FROM main.${quoteIdentifier(tableName)}`
        )
      }
      // Ownership changes only after the source alias can reference the new table.
      // Until this point the caller remains responsible for dropping it on failure.
      this.nativeSources.set(datasetId, { tableName, version })
      this.nativeTables.add(tableName)
      this.fileSources.delete(datasetId)
      this.sourceErrors.delete(datasetId)
      if (registeredVersion) {
        const viewName = duckDBViewName(datasetId)
        this.ownedViews.add(viewName)
        this.registeredSourceVersions.set(datasetId, version)
        const previousFileName = this.registeredSourceFiles.get(datasetId)
        if (previousFileName) {
          await this.db.dropFile(previousFileName).catch(() => {})
          this.registeredSourceFiles.delete(datasetId)
        }
      } else {
        this.registeredSourceVersions.delete(datasetId)
      }
      if (previous?.tableName && previous.tableName !== tableName) {
        await this.initialize()
        try {
          await this.connection.query(`DROP TABLE IF EXISTS main.${quoteIdentifier(previous.tableName)}`)
          this.nativeTables.delete(previous.tableName)
        } catch (_) {
          // Retain ownership so report teardown can retry cleanup.
        }
      }
    } finally {
      release()
    }
  }

  // registerFileSource retains the schema of an empty downloaded dataset.
  async registerFileSource (datasetId, file, extension, version) {
    const release = await this.acquireExecution()
    try {
      this.assertOpen()
      this.fileSources.set(datasetId, { file, extension, version })
      this.registeredSourceVersions.delete(datasetId)
      this.sourceErrors.delete(datasetId)
    } finally {
      release()
    }
  }

  hasSource (datasetId, version) {
    return this.nativeSources.get(datasetId)?.version === version ||
      this.fileSources.get(datasetId)?.version === version
  }

  // failSource prevents stale native or file data from being reused until a successful refresh arrives.
  async failSource (datasetId, error, version = null) {
    const viewName = duckDBViewName(datasetId)
    const nativeSource = this.nativeSources.get(datasetId)
    const fileName = this.registeredSourceFiles.get(datasetId)
    this.nativeSources.delete(datasetId)
    this.fileSources.delete(datasetId)
    this.registeredSourceVersions.delete(datasetId)
    this.registeredSourceFiles.delete(datasetId)
    this.sourceErrors.set(datasetId, { error, version })
    if (!this.connection && (nativeSource?.tableName || fileName)) {
      await this.initialize()
    }
    if (this.connection) {
      await this.connection.query(`DROP VIEW IF EXISTS datasets.${quoteIdentifier(viewName)}`).catch(() => {})
      this.ownedViews.delete(viewName)
      if (nativeSource?.tableName) {
        try {
          await this.connection.query(`DROP TABLE IF EXISTS main.${quoteIdentifier(nativeSource.tableName)}`)
          this.nativeTables.delete(nativeSource.tableName)
        } catch (_) {
          // Retain ownership so report teardown can retry cleanup.
        }
      }
    }
    if (fileName && this.db) {
      await this.db.dropFile(fileName).catch(() => {})
    }
  }

  sourceError (datasetId, version) {
    const sourceError = this.sourceErrors.get(datasetId)
    if (!sourceError || (sourceError.version && sourceError.version !== version)) {
      return null
    }
    return sourceError.error
  }

  // removeSource releases the native table, file and report alias owned by one dataset.
  async removeSource (datasetId) {
    const release = await this.acquireExecution()
    try {
      this.nextGeneration()
      const tableName = this.nativeSources.get(datasetId)?.tableName
      const viewName = duckDBViewName(datasetId)
      const fileName = this.registeredSourceFiles.get(datasetId)
      this.nativeSources.delete(datasetId)
      this.fileSources.delete(datasetId)
      this.sourceErrors.delete(datasetId)
      this.registeredSourceVersions.delete(datasetId)
      const ownsView = this.ownedViews.has(viewName)
      if (!this.connection && (tableName || fileName || ownsView)) {
        await this.initialize()
      }
      if (this.connection) {
        try {
          await this.connection.query(`DROP VIEW IF EXISTS datasets.${quoteIdentifier(viewName)}`)
          this.ownedViews.delete(viewName)
        } catch (_) {
          // Retain ownership so report teardown can retry cleanup.
        }
        if (tableName) {
          try {
            await this.connection.query(`DROP TABLE IF EXISTS main.${quoteIdentifier(tableName)}`)
            this.nativeTables.delete(tableName)
          } catch (_) {
            // Retain ownership so report teardown can retry cleanup.
          }
        }
      }
      if (fileName && this.db) {
        try {
          await this.db.dropFile(fileName)
          this.registeredSourceFiles.delete(datasetId)
        } catch (_) {
          // Retain ownership so report teardown can retry cleanup.
        }
      }
    } finally {
      release()
    }
  }

  nextGeneration () {
    this.generation++
    return this.generation
  }

  // acquireExecution serializes generations on the single report-local connection.
  async acquireExecution () {
    const previous = this.execution
    let release
    this.execution = new Promise(resolve => {
      release = resolve
    })
    await previous
    return release
  }

  isCurrent (generation) {
    return !this.closed && generation === this.generation
  }

  // registerSource points the stable dataset-ID view at the exact pinned source revision.
  async registerSource (datasetId, version) {
    const nativeSource = this.nativeSources.get(datasetId)
    const fileSource = this.fileSources.get(datasetId)
    const source = nativeSource?.version === version
      ? nativeSource
      : fileSource?.version === version ? fileSource : null
    if (!source) {
      return false
    }
    if (this.registeredSourceVersions.get(datasetId) === version) {
      return true
    }
    await this.initialize()
    const viewName = duckDBViewName(datasetId)
    await this.connection.query(`DROP VIEW IF EXISTS datasets.${quoteIdentifier(viewName)}`)
    this.ownedViews.add(viewName)
    const previousFileName = this.registeredSourceFiles.get(datasetId)
    if (source === nativeSource) {
      if (previousFileName) {
        await this.db.dropFile(previousFileName).catch(() => {})
        this.registeredSourceFiles.delete(datasetId)
      }
      await this.connection.query(
        `CREATE VIEW datasets.${quoteIdentifier(viewName)} AS SELECT * FROM main.${quoteIdentifier(source.tableName)}`
      )
    } else {
      const fileName = `${duckDBViewName(datasetId)}.${source.extension}`
      if (previousFileName) {
        await this.db.dropFile(previousFileName).catch(() => {})
      }
      await this.db.registerFileHandle(fileName, source.file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true)
      this.registeredSourceFiles.set(datasetId, fileName)
      if (source.extension === 'parquet') {
        await loadDuckDBExtension(this.connection, 'parquet')
      }
      await this.connection.query(
        `CREATE VIEW datasets.${quoteIdentifier(viewName)} AS SELECT * FROM ${sourceReaderSQL(fileName, source.extension)}`
      )
    }
    this.registeredSourceVersions.set(datasetId, version)
    return true
  }

  // registerDuckDBResult points a dependency alias at the exact materialized job revision.
  async registerDuckDBResult (datasetId, jobId) {
    const tableName = duckDBJobTableName(jobId)
    if (!this.jobTables.has(tableName)) {
      return false
    }
    await this.initialize()
    const viewName = duckDBViewName(datasetId)
    await this.connection.query(
      `CREATE OR REPLACE VIEW datasets.${quoteIdentifier(viewName)} AS SELECT * FROM dekart_internal.${quoteIdentifier(tableName)}`
    )
    this.ownedViews.add(viewName)
    return true
  }

  // executeNode binds parameters and keeps dependency results inside DuckDB.
  async executeNode (node, parameterValues) {
    await this.initialize()
    const viewName = duckDBViewName(node.dataset.id)
    const view = `datasets.${quoteIdentifier(viewName)}`
    const jobTableName = duckDBJobTableName(node.queryJob.id)
    const jobTable = `dekart_internal.${quoteIdentifier(jobTableName)}`
    let paramsTable = null
    if (parameterValues.length) {
      const paramsTableName = `params_${viewName}`
      paramsTable = `dekart_internal.${quoteIdentifier(paramsTableName)}`
      const boundColumns = parameterValues.map((_, index) => `CAST(? AS VARCHAR) AS ${quoteIdentifier(`p${index}`)}`)
      const statement = await this.connection.prepare(`SELECT ${boundColumns.join(', ')}`)
      let boundParameters
      try {
        boundParameters = await statement.query(...parameterValues)
      } finally {
        await statement.close()
      }
      await this.connection.query(`DROP TABLE IF EXISTS ${paramsTable}`)
      await this.connection.insertArrowTable(boundParameters, {
        name: paramsTableName,
        schema: 'dekart_internal',
        create: true
      })
    }
    try {
      await this.connection.query(`CREATE OR REPLACE TABLE ${jobTable} AS ${node.queryJob.queryText}`)
      this.jobTables.add(jobTableName)
    } finally {
      if (paramsTable) {
        await this.connection.query(`DROP TABLE IF EXISTS ${paramsTable}`).catch(() => {})
      }
    }
    if (!node.publish) {
      return { totalRows: 0 }
    }
    await this.connection.query(`CREATE OR REPLACE VIEW ${view} AS SELECT * FROM ${jobTable}`)
    this.ownedViews.add(viewName)
    const columns = await getColumnTypes(this.connection, jobTable)
    const reader = await this.connection.send(castDuckDBTypesForKepler(jobTable, columns), true)
    const result = new Table(await reader.readAll())
    setGeoArrowWKBExtension(result, columns)
    return {
      table: result,
      typeMap: getDuckDBColumnTypesMap(columns),
      totalRows: result.numRows
    }
  }

  // discardJobTables retains only revisions reachable from the current streamed graph.
  async discardJobTables (jobIds) {
    await this.initialize()
    const retained = new Set(jobIds.map(duckDBJobTableName))
    for (const tableName of this.jobTables) {
      if (!retained.has(tableName)) {
        await this.connection.query(`DROP TABLE IF EXISTS dekart_internal.${quoteIdentifier(tableName)}`)
        this.jobTables.delete(tableName)
      }
    }
  }

  // close tears down report-local workers and invalidates late results.
  async close () {
    this.closed = true
    this.generation++
    // A sent DuckDB query must not keep the old report's execution lock alive after navigation.
    await this.connection?.cancelSent().catch(() => {})
    const release = await this.acquireExecution()
    try {
      if (this.initializing) {
        await this.initializing.catch(() => {})
      }
      await this.releaseResources()
    } finally {
      release()
    }
  }
}

let activeRuntime = null
let runtimeCleanup = Promise.resolve()

function scheduleRuntimeClose (runtime) {
  runtimeCleanup = runtimeCleanup
    .catch(() => {})
    .then(() => runtime.close())
  return runtimeCleanup
}

export function getDuckDBRuntime (reportId) {
  if (!activeRuntime || activeRuntime.reportId !== reportId || activeRuntime.closed) {
    if (activeRuntime) {
      scheduleRuntimeClose(activeRuntime)
    }
    activeRuntime = new DuckDBReportRuntime(reportId, runtimeCleanup)
  }
  return activeRuntime
}

export function closeDuckDBRuntime (reportId) {
  // Late cleanup from an old report must not close the next report's worker.
  if (activeRuntime?.reportId !== reportId) {
    return
  }
  const runtime = activeRuntime
  activeRuntime = null
  scheduleRuntimeClose(runtime)
}

export async function removeDuckDBRuntimeSource (reportId, datasetId) {
  if (activeRuntime?.reportId !== reportId || activeRuntime.closed) {
    return
  }
  await activeRuntime.removeSource(datasetId)
}
