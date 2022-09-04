terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.16"
    }
  }
  required_version = ">= 1.2.0"
  # This is an example, so no terraform backend configuration
}

provider "aws" {
  region = var.region
}
