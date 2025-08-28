import { ConnectionType } from 'dekart-proto/dekart_pb'
import { bigQueryKeywords } from './bigQueryKeywords'
import { snowflakeKeywords } from './snowflakeKeywords'
import { sedonaKeywords } from './sedonaKeywords'

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

const wherobotsCustomCompleter = {
  getCompletions (editor, session, pos, prefix, callback) {
    callback(null, sedonaKeywords)
  }
}

export function getDatasourceMeta (datasource) {
  switch (datasource) {
    case 'SNOWFLAKE':
    case ConnectionType.CONNECTION_TYPE_SNOWFLAKE:
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
    case ConnectionType.CONNECTION_TYPE_BIGQUERY:
    case ConnectionType.CONNECTION_TYPE_UNSPECIFIED: // legacy user connections
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
    case ConnectionType.CONNECTION_TYPE_ATHENA:
    case 'ATHENA':
      return {
        name: 'Athena',
        style: 'athena',
        usageStatsId: 1
      }
    case 'WHEROBOTS':
    case ConnectionType.CONNECTION_TYPE_WHEROBOTS:
      return {
        name: 'Wherobots',
        style: 'wherobots',
        usageStatsId: 4,
        completer: wherobotsCustomCompleter,
        sampleQuery: `SELECT
    latitude,
    longitude
FROM
    wherobots_open_data.foursquare.places
WHERE
    country = 'US'
    AND LOWER(name) = 'starbucks'
LIMIT 1000;`
      }
    default:
      return {
        name: 'Unknown',
        usageStatsId: 0
      }
  }
}
