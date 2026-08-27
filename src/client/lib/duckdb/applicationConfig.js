import { initApplicationConfig } from '@kepler.gl/utils'

let duckDBAdapter = null

// configureDuckDB installs the shared browser database before report data starts loading.
export async function configureDuckDB () {
  const [{ createSharedDuckDBAdapter }, { DekartDuckDBTable }] = await Promise.all([
    import('./database'),
    import('./table')
  ])
  duckDBAdapter ||= createSharedDuckDBAdapter()
  initApplicationConfig({
    table: DekartDuckDBTable,
    database: duckDBAdapter,
    // Progressive batches map to separate Deck.gl layers and degrade large-map FPS.
    useArrowProgressiveLoading: false
  })
}
