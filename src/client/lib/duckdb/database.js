import * as duckdb from '@duckdb/duckdb-wasm'
import { DuckDBWasmAdapter } from '@kepler.gl/duckdb'
import duckdbMvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import duckdbEhWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import duckdbMvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import duckdbEhWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import spatialMvpWasm from './extensions/spatial-mvp.duckdb_extension.wasm?url'
import spatialEhWasm from './extensions/spatial-eh.duckdb_extension.wasm?url'
import parquetMvpWasm from './extensions/parquet-mvp.duckdb_extension.wasm?url'
import parquetEhWasm from './extensions/parquet-eh.duckdb_extension.wasm?url'

const LOCAL_BUNDLES = {
  mvp: {
    mainModule: duckdbMvpWasm,
    mainWorker: duckdbMvpWorker
  },
  eh: {
    mainModule: duckdbEhWasm,
    mainWorker: duckdbEhWorker
  }
}

export function quoteIdentifier (value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

// getColumnTypes returns DuckDB types for a table or schema-qualified view.
export async function getColumnTypes (connection, reference) {
  const description = await connection.query(`DESCRIBE SELECT * FROM ${reference}`)
  const names = description.getChildAt(0)
  const types = description.getChildAt(1)
  return [...Array(description.numRows).keys()].map(index => ({
    name: names.get(index),
    type: types.get(index)
  }))
}

function quoteString (value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

export function sourceReaderSQL (fileName, extension) {
  if (extension === 'parquet') {
    return `read_parquet(${quoteString(fileName)})`
  }
  if (extension === 'geojson' || extension === 'json') {
    return `(SELECT * EXCLUDE (wkb_geometry), wkb_geometry AS _geojson FROM ST_Read(${quoteString(fileName)}, keep_wkb=true))`
  }
  return `read_csv_auto(${quoteString(fileName)}, header=true)`
}

function throwIfAborted (signal) {
  if (!signal?.aborted) {
    return
  }
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('DuckDB source load was aborted')
}

// runCancelableDuckDBQuery interrupts the dedicated source connection when its download is superseded.
async function runCancelableDuckDBQuery (connection, sql, signal) {
  throwIfAborted(signal)
  const cancel = () => connection.cancelSent().catch(() => {})
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    const result = await connection.query(sql)
    throwIfAborted(signal)
    return result
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}

// installExtension registers one bundled extension the first time a source or query needs it.
async function installExtension (db, name, asset) {
  const response = await window.fetch(asset)
  if (!response.ok) {
    throw new Error(`Failed to load the local DuckDB ${name} extension: HTTP ${response.status}`)
  }
  const fileName = `${name}.duckdb_extension.wasm`
  await db.registerFileBuffer(fileName, new Uint8Array(await response.arrayBuffer()))
  const connection = await db.connect()
  try {
    await connection.query(`INSTALL ${quoteString(fileName)}`)
  } finally {
    await connection.close()
  }
}

// initializeDuckDB creates the single database used by Kepler and report materialization.
async function initializeDuckDB () {
  const bundle = await duckdb.selectBundle(LOCAL_BUNDLES)
  const worker = new window.Worker(bundle.mainWorker)
  const workerError = new Promise((_resolve, reject) => {
    worker.addEventListener('error', event => {
      reject(new Error(`DuckDB worker failed: ${event.message}`))
    }, { once: true })
  })
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
  try {
    await Promise.race([
      db.instantiate(bundle.mainModule, bundle.pthreadWorker),
      workerError
    ])
    await db.open({})
    const connection = await db.connect()
    try {
      await connection.query('SET autoinstall_known_extensions=false')
      await connection.query('SET autoload_known_extensions=false')
      const useEH = bundle.mainModule === duckdbEhWasm
      const extensionAssets = {
        spatial: useEH ? spatialEhWasm : spatialMvpWasm,
        parquet: useEH ? parquetEhWasm : parquetMvpWasm
      }
      // spatial/parquet → install bundled files
      // h3             → install from bundled local repository
      // json           → already built in
      // all four       → LOAD to activate
      for (const [name, asset] of Object.entries(extensionAssets)) {
        await installExtension(db, name, asset)
      }
      await connection.query(
        `INSTALL h3 FROM ${quoteString(`${window.location.origin}/duckdb-extensions`)}`
      )
      for (const name of ['spatial', 'parquet', 'json', 'h3']) {
        await connection.query(`LOAD ${quoteString(name)}`)
      }
    } finally {
      await connection.close()
    }
    return db
  } catch (error) {
    await db.terminate().catch(() => {})
    throw error
  }
}

let duckDBPromise = null
let sourceSequence = 0

export function getSharedDuckDB () {
  if (!duckDBPromise) {
    duckDBPromise = initializeDuckDB().catch(error => {
      // A transient worker or extension failure must not poison every later run.
      duckDBPromise = null
      throw error
    })
  }
  return duckDBPromise
}

// loadDuckDBExtension loads an eagerly installed extension on this connection.
export async function loadDuckDBExtension (connection, name) {
  await connection.query(`LOAD ${quoteString(name)}`)
}

// createSharedDuckDBAdapter exposes the shared database through Kepler's adapter contract.
export function createSharedDuckDBAdapter () {
  let adapterPromise
  const getAdapter = () => {
    if (!adapterPromise) {
      adapterPromise = getSharedDuckDB()
        .then(db => new DuckDBWasmAdapter(Promise.resolve(db)))
        .catch(error => {
          adapterPromise = null
          throw error
        })
    }
    return adapterPromise
  }
  return {
    connect: async () => (await getAdapter()).connect(),
    registerFileText: async (...args) => (await getAdapter()).registerFileText(...args),
    registerFileHandle: async (...args) => (await getAdapter()).registerFileHandle(...args)
  }
}

// createDuckDBSourceTable loads one immutable source revision into its report-local native table.
export async function createDuckDBSourceTable (file, extension, datasetId, signal) {
  const db = await getSharedDuckDB()
  throwIfAborted(signal)
  const sequence = ++sourceSequence
  const safeDatasetId = datasetId.replaceAll('-', '_')
  const tableName = `dekart_source_${safeDatasetId}_${sequence}`
  const fileName = `${tableName}.${extension}`
  const connection = await db.connect()
  try {
    if (extension === 'parquet') {
      await loadDuckDBExtension(connection, 'parquet')
    } else if (extension === 'geojson' || extension === 'json') {
      await loadDuckDBExtension(connection, 'spatial')
    }
    await db.registerFileHandle(fileName, file, duckdb.DuckDBDataProtocol.BROWSER_FILEREADER, true)
    throwIfAborted(signal)
    await runCancelableDuckDBQuery(
      connection,
      `CREATE TABLE main.${quoteIdentifier(tableName)} AS SELECT * FROM ${sourceReaderSQL(fileName, extension)}`,
      signal
    )
    const count = await runCancelableDuckDBQuery(
      connection,
      `SELECT COUNT(*) AS total_rows FROM main.${quoteIdentifier(tableName)}`,
      signal
    )
    return { tableName, totalRows: Number(count.getChildAt(0).get(0)) }
  } catch (error) {
    await connection.query(`DROP TABLE IF EXISTS main.${quoteIdentifier(tableName)}`).catch(() => {})
    throw error
  } finally {
    await connection.close().catch(() => {})
    await db.dropFile(fileName).catch(() => {})
  }
}

// dropDuckDBTable releases a native source table that was never adopted or is no longer current.
export async function dropDuckDBTable (tableName) {
  if (!tableName) {
    return
  }
  const db = await getSharedDuckDB()
  const connection = await db.connect()
  try {
    await connection.query(`DROP TABLE IF EXISTS main.${quoteIdentifier(tableName)}`)
  } finally {
    await connection.close().catch(() => {})
  }
}
