
export function getDatasourceMeta (datasource) {
  switch (datasource) {
    case 'SNOWFLAKE':
      return {
        name: 'Snowflake',
        usageStatsId: 3
      }
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
