
export function getDatasourceMeta (datasource) {
  switch (datasource) {
    case 'BQ':
      return {
        name: 'BigQuery',
        usageStatsId: 2
      }
    case 'ATHENA':
      return {
        name: 'Athena',
        usageStatsId: 1
      }
    default:
      return {
        name: 'Unknown',
        usageStatsId: 0
      }
  }
}
