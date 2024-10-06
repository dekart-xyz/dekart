import { Connection } from '../../proto/dekart_pb'

export function getDatasourceMeta (datasource) {
  switch (datasource) {
    case 'SNOWFLAKE':
    case Connection.ConnectionType.CONNECTION_TYPE_SNOWFLAKE:
      return {
        name: 'Snowflake',
        style: 'snowflake',
        sampleQuery: `-- Instructions:
-- 1. Go to Snowflake Marketplace and search for Overture Maps:
--    https://app.snowflake.com/marketplace/data-products/search?search=overture%20maps%20places
-- 2. Get 'Places' dataset. These dataset will be instantly available in your Snowflake account.
-- 3. Ensure the following GRANT statement is run by ACCOUNTADMIN to allow Dekart to access the dataset:
--    GRANT IMPORTED PRIVILEGES ON DATABASE OVERTURE_MAPS__PLACES TO APPLICATION dekart;

-- All restaurants in the world (920,600 points)
SELECT
    NAMES['primary'] AS name,                      -- Extracts the primary name of the restaurant
    ST_X(ST_CENTROID(GEOMETRY)) AS longitude,       -- Extracts the longitude (X coordinate) of the centroid
    ST_Y(ST_CENTROID(GEOMETRY)) AS latitude         -- Extracts the latitude (Y coordinate) of the centroid
FROM OVERTURE_MAPS__PLACES.CARTO.PLACE
WHERE categories['primary'] = 'restaurant';         -- Filters only the places categorized as 'restaurant'
`,
        usageStatsId: 3
      }
    case 'BQ':
    case Connection.ConnectionType.CONNECTION_TYPE_BIGQUERY:
    case Connection.ConnectionType.CONNECTION_TYPE_UNSPECIFIED: // legacy user connections
      return {
        name: 'BigQuery',
        style: 'bigquery',
        usageStatsId: 2,
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
