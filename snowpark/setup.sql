-- details https://github.com/snowflakedb/native-apps-examples

CREATE APPLICATION ROLE IF NOT EXISTS app_admin;
CREATE APPLICATION ROLE IF NOT EXISTS app_user;
CREATE SCHEMA IF NOT EXISTS app_public;
GRANT USAGE ON SCHEMA app_public TO APPLICATION ROLE app_admin;
GRANT USAGE ON SCHEMA app_public TO APPLICATION ROLE app_user;
CREATE OR ALTER VERSIONED SCHEMA v1;
GRANT USAGE ON SCHEMA v1 TO APPLICATION ROLE app_admin;

-- Create a stage to store application state
CREATE STAGE IF NOT EXISTS app_public.app_state_stage;

-- Grant privileges on the stage to the application roles
GRANT READ ON STAGE app_public.app_state_stage TO APPLICATION ROLE app_user;
GRANT READ, WRITE ON STAGE app_public.app_state_stage TO APPLICATION ROLE app_admin;

CREATE OR REPLACE PROCEDURE v1.register_single_callback(ref_name STRING, operation STRING, ref_or_alias STRING)
 RETURNS STRING
 LANGUAGE SQL
 AS $$
      BEGIN
      CASE (operation)
         WHEN 'ADD' THEN
            SELECT system$set_reference(:ref_name, :ref_or_alias);
         WHEN 'REMOVE' THEN
            SELECT system$remove_reference(:ref_name);
         WHEN 'CLEAR' THEN
            SELECT system$remove_reference(:ref_name);
         ELSE
            RETURN 'Unknown operation: ' || operation;
      END CASE;
      RETURN 'Operation ' || operation || ' succeeds.';
      END;
   $$;
GRANT USAGE ON PROCEDURE v1.register_single_callback(STRING, STRING, STRING) TO APPLICATION ROLE app_admin;

CREATE OR REPLACE PROCEDURE v1.get_configuration(ref_name STRING)
RETURNS STRING
LANGUAGE SQL
AS
$$
BEGIN
  CASE (UPPER(ref_name))
      WHEN 'MAPBOX_EAI' THEN
          RETURN OBJECT_CONSTRUCT(
              'type', 'CONFIGURATION',
              'payload', OBJECT_CONSTRUCT(
                  'host_ports', ARRAY_CONSTRUCT('api.mapbox.com'),
                  'allowed_secrets', 'NONE')
          )::STRING;
      ELSE
          RETURN '';
  END CASE;
END;
$$;

GRANT USAGE ON PROCEDURE v1.get_configuration(STRING) TO APPLICATION ROLE app_admin;


-- The version initializer callback is executed after a successful installation, upgrade, or downgrade of an application object.
-- In case the application fails to upgrade, the version initializer of the previous (successful) version will be executed so you
-- can clean up application state that may have been modified during the failed upgrade.
CREATE OR REPLACE PROCEDURE v1.init()
RETURNS STRING
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
BEGIN
    ALTER SERVICE IF EXISTS app_public.st_spcs FROM SPECIFICATION_FILE='service.yaml';
    RETURN 'init complete';
END $$;

GRANT USAGE ON PROCEDURE v1.init() TO APPLICATION ROLE app_admin;

CREATE OR REPLACE PROCEDURE v1.start_service(pool_name VARCHAR)
    RETURNS string
    LANGUAGE sql
    AS $$
BEGIN
    CREATE SERVICE IF NOT EXISTS app_public.st_spcs
        IN COMPUTE POOL Identifier(:pool_name)
        FROM SPECIFICATION_FILE='service.yaml'
        QUERY_WAREHOUSE= wh_dekart
        EXTERNAL_ACCESS_INTEGRATIONS=( reference('MAPBOX_EAI') );

    GRANT USAGE ON SERVICE app_public.st_spcs TO APPLICATION ROLE app_user;
    grant service role app_public.ST_SPCS!ALL_ENDPOINTS_USAGE to application role APP_ADMIN;
    grant service role app_public.ST_SPCS!ALL_ENDPOINTS_USAGE to application role APP_USER;


    RETURN 'Service started. Check status, and when ready, get URL';
END
$$;
GRANT USAGE ON PROCEDURE v1.start_service(VARCHAR) TO APPLICATION ROLE app_admin;


CREATE OR REPLACE PROCEDURE v1.create_services(privileges array)
 RETURNS STRING
 LANGUAGE SQL
 AS
 $$
    BEGIN
        CREATE COMPUTE POOL IF NOT EXISTS service_compute_pool
        MIN_NODES = 1
        MAX_NODES = 1
        INSTANCE_FAMILY = CPU_X64_XS;
        CREATE WAREHOUSE IF NOT EXISTS wh_dekart WITH WAREHOUSE_SIZE='XSMALL';
        CALL v1.start_service('service_compute_pool');
    END;
$$;
GRANT USAGE ON PROCEDURE v1.create_services(array) TO APPLICATION ROLE app_admin;
