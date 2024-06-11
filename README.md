# Dekart on Snowpark

```sql

-- with adminaccount
CREATE COMPUTE POOL dekart_snowpark_cp
  MIN_NODES = 1
  MAX_NODES = 1
  INSTANCE_FAMILY = CPU_X64_XS;
CREATE ROLE dekart;
GRANT ROLE dekart TO USER DELFRRR;
CREATE DATABASE dekart_snowpark;
GRANT OWNERSHIP ON DATABASE dekart_snowpark TO ROLE dekart COPY CURRENT GRANTS;
GRANT OWNERSHIP ON SCHEMA dekart_snowpark.public TO ROLE dekart;
GRANT USAGE, MONITOR ON COMPUTE POOL dekart_snowpark_cp TO ROLE dekart;
GRANT BIND SERVICE ENDPOINT ON ACCOUNT TO ROLE dekart;

CREATE OR REPLACE NETWORK RULE dekart_snowpark_egress
  MODE = EGRESS
  TYPE = HOST_PORT
  VALUE_LIST = ('api.mapbox.com');

CREATE EXTERNAL ACCESS INTEGRATION dekart_snowpark_egress_integration
  ALLOWED_NETWORK_RULES = (dekart_snowpark_egress)
  ENABLED = true;

-- this seems to need accountadmin
GRANT USAGE ON INTEGRATION dekart_snowpark_egress_integration TO ROLE dekart;


-- with dekart role
CREATE IMAGE REPOSITORY dekart_snowpark_repository;

CREATE OR REPLACE STAGE dekart_snowpark_stage ENCRYPTION = (type = 'SNOWFLAKE_SSE');
-- LIST @dekart_snowpark_stage;

CREATE SERVICE dekart_snowpark_service in COMPUTE POOL dekart_snowpark_cp
FROM @dekart_snowpark_stage
spec=snowpark_spec.yaml
QUERY_WAREHOUSE=DEKART_WH
EXTERNAL_ACCESS_INTEGRATIONS=(DEKART_SNOWPARK_EGRESS_INTEGRATION)
MAX_INSTANCES=1;

SHOW ENDPOINTS IN SERVICE dekart_snowpark;

-- DROP SERVICE dekart_snowpark;

```

# Snowpark package

```sql
use role accountadmin;
create security integration if not exists snowservices_ingress_oauth
  type=oauth
  oauth_client=snowservices_ingress
  enabled=true;

use role accountadmin;
create role if not exists nap_role;
grant role nap_role to role accountadmin;
grant create integration on account to role nap_role;
grant create compute pool on account to role nap_role;
grant create warehouse on account to role nap_role;
grant create database on account to role nap_role;
grant create application package on account to role nap_role;
grant create application on account to role nap_role with grant option;
grant bind service endpoint on account to role nap_role;

use role nap_role;
create database if not exists dekart_app;
create schema if not exists dekart_app.napp;
create stage if not exists dekart_app.napp.app_stage;
create image repository if not exists dekart_app.napp.img_repo;
create warehouse if not exists wh_nap with warehouse_size='xsmall';

use role accountadmin;
create role if not exists nac_role;
grant role nac_role to role accountadmin;
create warehouse if not exists wh_nac with warehouse_size='xsmall';
grant usage on warehouse wh_nac to role nac_role with grant option;
grant imported privileges on database snowflake_sample_data to role nac_role;
grant create database on account to role nac_role;
grant bind service endpoint on account to role nac_role with grant option;
grant create network policy on account to role nac_role;
grant create integration on account to role nac_role;
grant create compute pool on account to role nac_role;
grant create application on account to role nac_role;

use role nap_role;
show image repositories in schema dekart_app.napp;

-- recreate package and instance

use role nap_role;
create application package dekart_app_pkg;
alter application package dekart_app_pkg add version v1 using @dekart_app.napp.app_stage;
grant install, develop on application package dekart_app_pkg to role nac_role;

use role nac_role;
use warehouse wh_nac;
create application dekart_app_instance from application package dekart_app_pkg using version v1;
create compute pool pool_nac for application dekart_app_instance
    min_nodes = 1 max_nodes = 1
    instance_family = cpu_x64_xs
    auto_resume = true;
grant usage on compute pool pool_nac to application dekart_app_instance;
grant usage on warehouse wh_nac to application dekart_app_instance;
grant bind service endpoint on account to application dekart_app_instance;
use schema dekart_app_instance.app_public;
create or replace network rule mapbox_egress
  mode = egress
  type = host_port
  value_list = ('api.mapbox.com');
create external access integration if not exists mapbox_egress_integration
  allowed_network_rules = (mapbox_egress)
  enabled = true;
grant usage on integration mapbox_egress_integration to application dekart_app_instance;
call dekart_app_instance.app_public.start_app('POOL_NAC', 'WH_NAC', 'MAPBOX_EGRESS_INTEGRATION');

-- get app url

use role nac_role;
call dekart_app_instance.app_public.app_url();

-- cleanup

use role nac_role;
drop application dekart_app_instance;
drop compute pool pool_nac;

use role nap_role;
drop application package dekart_app_pkg;


```

