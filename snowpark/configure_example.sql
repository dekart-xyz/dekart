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

use role accountadmin;
grant create data exchange listing on account to role nap_role;




use role nap_role;
create database if not exists dekart_app;
create schema if not exists dekart_app.napp;
create stage if not exists dekart_app.napp.app_stage;
create image repository if not exists dekart_app.napp.img_repo;
create warehouse if not exists wh_nap with warehouse_size='xsmall';

use role accountadmin;
create role if not exists nac_role;
grant role nac_role to role accountadmin;
grant role nac_role to user delfrrr;
create warehouse if not exists wh_nac with warehouse_size='xsmall';
grant usage on warehouse wh_nac to role nac_role with grant option;
grant imported privileges on database snowflake_sample_data to role nac_role;
grant create database on account to role nac_role;
grant bind service endpoint on account to role nac_role with grant option;
grant create compute pool on account to role nac_role;
grant create application on account to role nac_role;

use role accountadmin;
grant create network rule on account to role nac_role;
grant create integration on account to role nac_role;


use role nap_role;
show image repositories in schema dekart_app.napp;


--package and instance create

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





