

variable "dekart_deployment_name" {
  default     = "dekart"
  description = "prefix for your deployment resource names"
}

variable "default_zone_name" {
  description = "route 53 zone name for dekart deployment"
}

# cognito configuration parameters, example https://beabetterdev.com/2021/08/16/how-to-add-google-social-sign-on-to-your-amazon-cognito-user-pool/
variable "user_pool_arn" {}
variable "user_pool_client_id" {}
variable "user_pool_domain" {}

variable "mapbox_token" {
  description = "Mapbox token needed to show map in Dekart UI"
}
