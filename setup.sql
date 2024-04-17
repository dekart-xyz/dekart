-- SYSTEM$LOG('error', 'Error message');

-- CREATE SCHEMA core;
-- CREATE APPLICATION ROLE app_user;

-- CREATE SCHEMA app_public;
-- GRANT USAGE ON SCHEMA app_public TO APPLICATION ROLE app_user;
-- CREATE OR REPLACE PROCEDURE app_public.start_app (pool_name varchar)
--    RETURNS string
--    LANGUAGE sql
--    as $$
-- BEGIN
-- CREATE SERVICE IF NOT EXISTS core.echo_service
--   IN COMPUTE POOL identifier(:pool_name)
--   spec=echo_spec.yaml;

CREATE SERVICE dekart_service
  IN COMPUTE POOL dekart_compute_pool
  FROM SPECIFICATION $$
    spec:
      containers:
      - name: dekart
        image: /dekart_image_database/dekart_image_schema/dekart_image_repo/dekart-snowpark
        readinessProbe:
          port: 8080
          path: /
        env:
          DEKART_MAPBOX_TOKEN: pk.eyJ1IjoiZGVsZnJyciIsImEiOiJja2l6MXZqdjgxaXFjMnNtZTgzaHhsMGM5In0.ifCwBcTR2U-jgDev22PaSw
          DEKART_STORAGE: SNOWFLAKE
          DEKART_DATASOURCE: SNOWFLAKE
          DEKART_CLOUD_STORAGE_BUCKET: XXX
      endpoints:
      - name: dekartendpoint
        port: 8080
        public: true
      $$
   QUERY_WAREHOUSE='DEKART_WH'
   MIN_INSTANCES=1
   MAX_INSTANCES=1;


RETURN 'Service successfully created';
END;
$$;

GRANT USAGE ON PROCEDURE app_public.start_app(varchar) TO APPLICATION ROLE app_user;