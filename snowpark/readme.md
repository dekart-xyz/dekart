# Dekart

```SQL
create warehouse if not exists wh_nac with warehouse_size='xsmall';
create security integration if not exists snowservices_ingress_oauth
  type=oauth
  oauth_client=snowservices_ingress
  enabled=true;
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
call dekart_app_instance.app_public.app_url();
```