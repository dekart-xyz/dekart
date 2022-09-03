# Deploying Dekart to AWS ECS with terraform

## Requires:

* AWS Account
* Route 53 zone
* Mapbox Token
* Athena Catalog and data source S3 bucket
* Cognito user pool configured

## Includes:

* network configuration example (VPC, public and private subnets)
* security groups example
* roles
* RDS configuration
* S3 bucket for query storage and results cache
* load balancer including https and SSO with Cognito
* ECS cluster, service and task running on FARGATE

## Usage:

Considering you have AWS credentials and terraform setup:

* Create `./terraform.tfvars.json` and define required variables, see `./variables.tf` for details
* Run `terraform apply`