import { Connection } from '../../proto/dekart_pb'
import { bigQueryKeywords } from './bigQueryKeywords'
import { snowflakeKeywords } from './snowflakeKeywords'

const bigQueryCustomCompleter = {
  getCompletions (editor, session, pos, prefix, callback) {
    callback(null, bigQueryKeywords)
  }
}

const snowflakeCustomCompleter = {
  getCompletions (editor, session, pos, prefix, callback) {
    callback(null, snowflakeKeywords)
  }
}

export function getDatasourceMeta (datasource) {
  switch (datasource) {
    case 'SNOWFLAKE':
    case Connection.ConnectionType.CONNECTION_TYPE_SNOWFLAKE:
      return {
        name: 'Snowflake',
        style: 'snowflake',
        completer: snowflakeCustomCompleter,
        examplesUrl: 'https://dekart.xyz/docs/about/snowflake-kepler-gl-examples/',
        sampleQuery: `-- Generate 100 random latitude and longitude points
SELECT
    ROUND(uniform(-90::float, 90::float, random()), 6) AS lat,  -- Generate random latitude between -90 and 90
    ROUND(uniform(-180::float, 180::float, random()), 6) AS lon  -- Generate random longitude between -180 and 180
FROM
    TABLE(GENERATOR(ROWCOUNT => 100));  -- Create 100 rows
`,
        usageStatsId: 3
      }
    case 'BQ':
    case Connection.ConnectionType.CONNECTION_TYPE_BIGQUERY:
    case Connection.ConnectionType.CONNECTION_TYPE_UNSPECIFIED: // legacy user connections
      return {
        name: 'BigQuery',
        style: 'bigquery',
        completer: bigQueryCustomCompleter,
        usageStatsId: 2,
        examplesUrl: 'https://dekart.xyz/docs/about/overture-maps-examples/',
        sampleQuery: `-- Select a random 0.1% sample of crimes from the Chicago crime dataset
SELECT
    primary_type,  -- Type of crime
    district,      -- District where the crime occurred
    latitude,      -- Latitude of the crime location
    longitude,     -- Longitude of the crime location
    date           -- Date of the crime
FROM
    \`bigquery-public-data.chicago_crime.crime\`  -- Chicago crime dataset
WHERE
    RAND() < 0.1 / 100.0;  -- Randomly select approximately 0.1% of the records
`
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
