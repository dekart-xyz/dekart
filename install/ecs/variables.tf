
# general
variable "region" {
  default = "us-east-1"
}
variable "zone_name" {
  description = "route 53 zone name for dekart deployment"
}
variable "mapbox_token" {
  description = "Mapbox token needed to show map in Dekart UI"
}

# dekart
variable "dekart_deployment_name" {
  default     = "dekart"
  description = "prefix for your deployment resource names"
}
variable "dekart_version" {
  default     = "0.13"
  description = "dekart version, see releases https://github.com/dekart-xyz/dekart/releases/"
}
variable "dekart_rds_db_name" {
  default     = "dekart"
  description = "RDS db name"
}
variable "dekart_rds_username" {
  default     = "dekart"
  description = "RDS db username"
}

# cognito
variable "user_pool_arn" {
  description = "cognito configuration parameters, example https://beabetterdev.com/2021/08/16/how-to-add-google-social-sign-on-to-your-amazon-cognito-user-pool/"
}
variable "user_pool_client_id" {}
variable "user_pool_domain" {}

# athena
variable "athena_s3_data_source" {
  type        = list(string)
  default     = ["my-athena-source-bucket/data/*"]
  description = "list of s3 objects accessed via Athena, for example osm-pds/planet/*"
}
variable "athena_catalog" {
  default = "AwsDataCatalog"
}

variable "athena_workgroup" {
  default = "primary"
}
