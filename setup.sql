CREATE APPLICATION ROLE dekart_app_user;
CREATE SCHEMA IF NOT EXISTS dekart_app_public;
GRANT USAGE ON SCHEMA dekart_app_public TO APPLICATION ROLE dekart_app_user;

CREATE OR REPLACE PROCEDURE dekart_app_public.start_app(pool_name VARCHAR, wh_name VARCHAR, eai_name VARCHAR)
    RETURNS string
    LANGUAGE sql
    AS $$
BEGIN
    -- EXECUTE IMMEDIATE 'CREATE SERVICE IF NOT EXISTS dekart_app_public.dekart_app_service IN COMPUTE POOL Identifier(''' || pool_name || ''') SPECIFICATION_FILE=snowpark_spec.yaml MAX_INSTANCES=1 QUERY_WAREHOUSE=''' || wh_name || ''' EXTERNAL_ACCESS_INTEGRATIONS=( ''' || Upper(eai_name) || ''' )';
    CREATE SERVICE IF NOT EXISTS dekart_app_public.dekart_app_service
        IN COMPUTE POOL Identifier(:pool_name)
        spec=snowpark_spec.yaml
        MAX_INSTANCES = 1
        QUERY_WAREHOUSE = Identifier(:wh_name)
        EXTERNAL_ACCESS_INTEGRATIONS = ( Identifier(:eai_name) );
    GRANT USAGE ON SERVICE dekart_app_public.dekart_app_service TO APPLICATION ROLE dekart_app_user;
    RETURN 'Service started. Check status, and when ready, get URL';
END
$$;

GRANT USAGE ON PROCEDURE dekart_app_public.start_app(VARCHAR, VARCHAR, VARCHAR) TO APPLICATION ROLE dekart_app_user;