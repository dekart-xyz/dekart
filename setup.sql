CREATE SCHEMA core;
CREATE APPLICATION ROLE app_user;

CREATE SCHEMA app_public;
GRANT USAGE ON SCHEMA app_public TO APPLICATION ROLE app_user;
CREATE OR REPLACE PROCEDURE app_public.start_app (pool_name varchar)
   RETURNS string
   LANGUAGE sql
   as $$
BEGIN
    CREATE SERVICE IF NOT EXISTS core.dekart_service
    IN COMPUTE POOL identifier(:pool_name)
    spec=spec.yaml;

    RETURN 'Service successfully created';
END;
$$;

GRANT USAGE ON PROCEDURE app_public.start_app(varchar) TO APPLICATION ROLE app_user;

