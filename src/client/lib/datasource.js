
export function getDatasourceMeta (datasource) {
  switch (datasource) {
    case 'SNOWFLAKE':
      return {
        name: 'Snowflake',
        style: 'snowflake',
        usageStatsId: 3
      }
    case 'BQ':
      return {
        name: 'BigQuery',
        style: 'bigquery',
        usageStatsId: 2
      }
    case 'ATHENA':
      return {
        name: 'Athena',
        style: 'athena',
        usageStatsId: 1
      }
    default:
      return {
        name: 'Unknown',
        usageStatsId: 0
      }
  }
}
