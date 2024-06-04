CREATE APPLICATION ROLE dekart_app_user;
CREATE SCHEMA IF NOT EXISTS dekart_app_public;
GRANT USAGE ON SCHEMA dekart_app_public TO APPLICATION ROLE dekart_app_user;

-- https://github.com/sfc-gh-bhess/na_spcs_python/blob/4e8069ca8d2336c1a6395c5c1aad79f74ed611b2/na_spcs_python/v1/setup.sql#L47-L48
CREATE OR REPLACE PROCEDURE dekart_app_public.start_app (pool_name VARCHAR, wh_name VARCHAR, eai_name VARCHAR)
    RETURNS string
    LANGUAGE sql
    AS $$
BEGIN
    EXECUTE IMMEDIATE 'CREATE SERVICE IF NOT EXISTS dekart_app_public.dekart_app_service
        IN COMPUTE POOL Identifier(''' || pool_name || ''')
        spec=snowpark_spec.yaml
        MAX_INSTANCES=1
        QUERY_WAREHOUSE=''' || wh_name || '''
        EXTERNAL_ACCESS_INTEGRATIONS=( ''' || Upper(eai_name) || ''' )';
    ;
    GRANT USAGE ON SERVICE dekart_app_public.dekart_app_service TO APPLICATION ROLE dekart_app_user;
    RETURN 'Service started. Check status, and when ready, get URL';
END
$$;

CREATE OR REPLACE PROCEDURE dekart_app_public.start_app_test (pool_name VARCHAR, wh_name VARCHAR, eai_name VARCHAR)
    RETURNS string
    LANGUAGE sql
    AS $$
BEGIN
    CREATE SERVICE dekart_app_public.dekart_app_service
        IN COMPUTE POOL Identifier(:pool_name)
        FROM SPECIFICATION $spec$
          spec:
            containers:
              - name: dekart
                image: /dekart_snowpark/public/dekart_snowpark_repository/dekart_snowpark:latest
                readinessProbe:
                  port: 8080
                  path: /
                env:
                  DEKART_MAPBOX_TOKEN: pk.eyJ1IjoiZGVsZnJyciIsImEiOiJja2l6MXZqdjgxaXFjMnNtZTgzaHhsMGM5In0.ifCwBcTR2U-jgDev22PaSw
                  DEKART_STORAGE: SNOWFLAKE
                  DEKART_DATASOURCE: SNOWFLAKE
                  DEKART_LOG_DEBUG: 1
                  DEKART_CORS_ORIGIN: null
                  DEKART_STREAM_TIMEOUT: 10
                volumeMounts:
                  - name: dekartstage
                    mountPath: /dekart/backup-volume
            volumes:
              - name: dekartstage
                source: "@dekart_snowpark_stage"
            endpoints:
              - name: dekartendpoint
                port: 8080
                public: true
            $spec$
    MAX_INSTANCES=1
    QUERY_WAREHOUSE=Identifier(:wh_name)
    EXTERNAL_ACCESS_INTEGRATIONS=(Identifier(:eai_name));
    GRANT USAGE ON SERVICE dekart_app_public.dekart_app_service TO APPLICATION ROLE dekart_app_user;
    RETURN 'Service started. Check status, and when ready, get URL';
END
$$;

GRANT USAGE ON PROCEDURE dekart_app_public.start_app(VARCHAR, VARCHAR, VARCHAR) TO APPLICATION ROLE dekart_app_user;
GRANT USAGE ON PROCEDURE dekart_app_public.start_app_test(VARCHAR, VARCHAR, VARCHAR) TO APPLICATION ROLE dekart_app_user;