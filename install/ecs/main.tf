terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.16"
    }
  }

  required_version = ">= 1.2.0"
}

provider "aws" {
  region  = "us-east-1"
}

resource "random_password" "rds_password" {
  length           = 16
  special          = true
  override_special = "!?$%^&*#()+={}~-[]<>"
}

resource "aws_secretsmanager_secret" "rds_credentials" {
  name = "dekart_rds_credential_secret"
}

resource "aws_secretsmanager_secret_version" "rds_credential_secret" {
  secret_id     = aws_secretsmanager_secret.rds_credentials.id
  secret_string = random_password.rds_password.result
  lifecycle {
    ignore_changes = [
      secret_string
    ]
  }
}


resource "aws_db_instance" "dekart_db_instance" {
   identifier                      = "dekart-db-instance"
   allocated_storage               = 10
   storage_type                    = "gp2"
   engine                          = "postgres"
   engine_version                  = "14.1"
   instance_class                  = "db.t3.micro"
   db_name                         = "dekart"
   username                        = "dekart"
   password                        = aws_secretsmanager_secret_version.rds_credential_secret.secret_string
   allow_major_version_upgrade     = false
   auto_minor_version_upgrade      = true
   port                            = 5432
   publicly_accessible             = false
   storage_encrypted               = true
   
   lifecycle {
     ignore_changes = [
       password
     ]
   }
 }