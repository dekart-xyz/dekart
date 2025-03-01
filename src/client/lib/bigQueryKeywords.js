export const bigQueryKeywords = [

  // // Aggregate Functions
  { name: 'COUNT', value: 'COUNT()', meta: 'function' },
  { name: 'SUM', value: 'SUM()', meta: 'function' },
  { name: 'AVG', value: 'AVG()', meta: 'function' },
  { name: 'MAX', value: 'MAX()', meta: 'function' },
  { name: 'MIN', value: 'MIN()', meta: 'function' },

  // String Functions
  { name: 'CONCAT', value: 'CONCAT()', meta: 'function' },
  { name: 'SUBSTR', value: 'SUBSTR()', meta: 'function' },
  { name: 'UPPER', value: 'UPPER()', meta: 'function' },
  { name: 'LOWER', value: 'LOWER()', meta: 'function' },
  { name: 'TRIM', value: 'TRIM()', meta: 'function' },

  // Date/Time Functions
  { name: 'CURRENT_DATE', value: 'CURRENT_DATE()', meta: 'function' },
  { name: 'CURRENT_TIMESTAMP', value: 'CURRENT_TIMESTAMP()', meta: 'function' },
  { name: 'DATE', value: 'DATE()', meta: 'function' },
  { name: 'DATETIME', value: 'DATETIME()', meta: 'function' },
  { name: 'FORMAT_TIMESTAMP', value: 'FORMAT_TIMESTAMP()', meta: 'function' },

  // Numeric Functions
  { name: 'ABS', value: 'ABS()', meta: 'function' },
  { name: 'CEIL', value: 'CEIL()', meta: 'function' },
  { name: 'FLOOR', value: 'FLOOR()', meta: 'function' },
  { name: 'ROUND', value: 'ROUND()', meta: 'function' },
  { name: 'SQRT', value: 'SQRT()', meta: 'function' },

  // GIS Functions
  { name: 'ST_GEOGPOINT', value: 'ST_GEOGPOINT()', meta: 'GIS function' },
  { name: 'ST_DISTANCE', value: 'ST_DISTANCE()', meta: 'GIS function' },
  { name: 'ST_WITHIN', value: 'ST_WITHIN()', meta: 'GIS function' },
  { name: 'ST_BUFFER', value: 'ST_BUFFER()', meta: 'GIS function' },
  { name: 'ST_AREA', value: 'ST_AREA()', meta: 'GIS function' },
  { name: 'ST_CENTROID', value: 'ST_CENTROID()', meta: 'GIS function' },
  { name: 'ST_CONTAINS', value: 'ST_CONTAINS()', meta: 'GIS function' },
  { name: 'ST_INTERSECTS', value: 'ST_INTERSECTS()', meta: 'GIS function' },
  { name: 'ST_UNION', value: 'ST_UNION()', meta: 'GIS function' },
  { name: 'ST_MAKEPOLYGON', value: 'ST_MAKEPOLYGON()', meta: 'GIS function' },
  { name: 'ST_MAKELINE', value: 'ST_MAKELINE()', meta: 'GIS function' },
  { name: 'ST_ASGEOJSON', value: 'ST_ASGEOJSON()', meta: 'GIS function' },

  // Analytical Functions
  { name: 'RANK', value: 'RANK()', meta: 'function' },
  { name: 'DENSE_RANK', value: 'DENSE_RANK()', meta: 'function' },
  { name: 'ROW_NUMBER', value: 'ROW_NUMBER()', meta: 'function' },
  { name: 'NTILE', value: 'NTILE()', meta: 'function' },

  // JSON Functions
  { name: 'JSON_EXTRACT', value: 'JSON_EXTRACT()', meta: 'function' },
  { name: 'JSON_EXTRACT_SCALAR', value: 'JSON_EXTRACT_SCALAR()', meta: 'function' },
  { name: 'TO_JSON_STRING', value: 'TO_JSON_STRING()', meta: 'function' },

  // ARRAY Functions
  { name: 'ARRAY', value: 'ARRAY()', meta: 'function' },
  { name: 'ARRAY_LENGTH', value: 'ARRAY_LENGTH()', meta: 'function' },
  { name: 'ARRAY_TO_STRING', value: 'ARRAY_TO_STRING()', meta: 'function' },
  { name: 'GENERATE_ARRAY', value: 'GENERATE_ARRAY()', meta: 'function' },

  // Struct Functions
  { name: 'STRUCT', value: 'STRUCT()', meta: 'function' },
  { name: 'CAST', value: 'CAST()', meta: 'function' }
]
