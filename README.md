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
CREATE IMAGE REPOSITORY dekart_snowpark;

CREATE OR REPLACE STAGE dekart_snowpark_stage ENCRYPTION = (type = 'SNOWFLAKE_SSE');
-- LIST @dekart_snowpark_stage;

CREATE SERVICE dekart_snowpark in COMPUTE POOL dekart_snowpark_cp
FROM @dekart_snowpark_stage
spec=snowpark_spec.yaml
QUERY_WAREHOUSE=DEKART_WH
EXTERNAL_ACCESS_INTEGRATIONS=(DEKART_SNOWPARK_EGRESS_INTEGRATION)
MAX_INSTANCES=1;

SHOW ENDPOINTS IN SERVICE dekart_snowpark;

-- DROP SERVICE dekart_snowpark;

```

