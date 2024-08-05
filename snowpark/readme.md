# Getting Started

Follow the steps below to set up and start the Dekart application in your Snowflake environment. The provided SQL code creates the necessary resources and grants the required permissions.

```SQL
-- Create a warehouse if it doesn't already exist
create warehouse if not exists wh_nac with warehouse_size='xsmall';

-- Create a security integration for OAuth authentication
create security integration if not exists snowservices_ingress_oauth
  type=oauth
  oauth_client=snowservices_ingress
  enabled=true;

-- Create a compute pool for the Dekart application
create compute pool pool_nac for application dekart
    -- Important: Dekart requires exactly one node to function properly
    min_nodes = 1  -- Minimum number of nodes
    max_nodes = 1  -- Maximum number of nodes
    instance_family = cpu_x64_xs  -- Instance type
    auto_resume = true;  -- Automatically resume the compute pool when needed

-- Grant usage on the compute pool to the Dekart application
grant usage on compute pool pool_nac to application dekart;

-- Grant usage on the warehouse to the Dekart application
grant usage on warehouse wh_nac to application dekart;

-- Grant permission for the Dekart application to bind service endpoints
grant bind service endpoint on account to application dekart;

-- Set the schema for the Dekart application
use schema dekart.app_public;

-- Create a network rule to allow egress traffic to Mapbox
-- Mapbox is used for loading basemaps in the Dekart application
-- No user data is sent to Mapbox
create or replace network rule mapbox_egress
  mode = egress
  type = host_port
  value_list = ('api.mapbox.com');

-- Create an external access integration for Mapbox egress
create external access integration if not exists mapbox_egress_integration
  allowed_network_rules = (mapbox_egress)
  enabled = true;

-- Grant usage on the Mapbox egress integration to the Dekart application
grant usage on integration mapbox_egress_integration to application dekart;

-- Start the Dekart application with the specified resources
call dekart.app_public.start_app('POOL_NAC', 'WH_NAC', 'MAPBOX_EGRESS_INTEGRATION');

-- Retrieve the URL for the Dekart application
call dekart.app_public.app_url();
```

This SQL script performs the following actions:

1. **Warehouse Creation**: Creates a warehouse named `wh_nac` with a size of 'xsmall' if it does not already exist.
2. **Security Integration**: Sets up an OAuth security integration named `snowservices_ingress_oauth`.
3. **Compute Pool Creation**: Creates a compute pool named `pool_nac` for the Dekart application, specifying the instance type and auto-resume feature.
4. **Permissions**: Grants the necessary permissions for the Dekart application to use the compute pool, warehouse, and bind service endpoints.
5. **Schema Usage**: Specifies the schema `dekart.app_public` for subsequent operations.
6. **Network Rule**: Defines a network rule to allow egress traffic to `api.mapbox.com`.
7. **Access Integration**: Creates an external access integration for Mapbox egress and grants usage permissions to the Dekart application.
8. **Start Application**: Initiates the Dekart application with the specified compute pool, warehouse, and integration.
9. **Retrieve Application URL**: Provides the URL to access the Dekart application.

By executing this script, you will set up the Dekart application in your Snowflake environment, ensuring all necessary resources and permissions are in place.

## Add access to datasets

To add access to datasets, you can use the following SQL command:

```SQL
-- Grant access to a dataset (example: OpenStreetMap New York)
GRANT IMPORTED PRIVILEGES ON DATABASE OPENSTREETMAP_NEW_YORK TO application dekart_app_instance;
```

## Stop the Application

To stop the Dekart application, execute the following SQL command:

```SQL
call dekart.app_public.stop_app();
```

For more information, visit https://dekart.xyz
