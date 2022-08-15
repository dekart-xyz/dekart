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
  region = "us-east-1"
}

locals {
  project = "dekart"
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

variable "mapbox_token" {}

resource "aws_db_instance" "dekart_db_instance" {
  identifier                  = "dekart-db-instance"
  allocated_storage           = 10
  storage_type                = "gp2"
  engine                      = "postgres"
  engine_version              = "14.1"
  instance_class              = "db.t3.micro"
  db_name                     = "dekart"
  username                    = "dekart"
  password                    = aws_secretsmanager_secret_version.rds_credential_secret.secret_string
  allow_major_version_upgrade = false
  auto_minor_version_upgrade  = true
  port                        = 5432
  publicly_accessible         = false
  storage_encrypted           = true

  lifecycle {
    ignore_changes = [
      password
    ]
  }
}

data "aws_region" "current" {}

resource "aws_s3_bucket" "storage_bucket" {
  bucket = "dekart-output"
}

resource "aws_cloudwatch_log_group" "log_group" {
  name              = local.project
  retention_in_days = 7
}

resource "aws_iam_role" "task_role" {
  name = "${local.project}-task-role"
  # managed_policy_arns = [
  #   "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  #   "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess",
  #   "arn:aws:iam::aws:policy/AWSXrayWriteOnlyAccess",
  #   "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
  # ]
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow",
        Action = "sts:AssumeRole",
        Sid    = "",
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      },
    ]
  })
}

resource "aws_iam_role" "execution_task_role" {
  name = "${local.project}-execution-task-role"
  managed_policy_arns = [
    "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
  ]
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow",
        Action = "sts:AssumeRole",
        Sid    = "",
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      },
    ]
  })
}

resource "aws_ecs_task_definition" "dekart" {
  family                   = "dekart"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  task_role_arn            = aws_iam_role.task_role.arn
  execution_role_arn       = aws_iam_role.execution_task_role.arn
  container_definitions    = <<TASK_DEFINITION
[
    {
       "name": "${local.project}",
       "image": "dekartxyz/dekart:0.8",
       "portmappings": [
          {
            "hostport": 8080,
            "protocol": "tcp",
            "containerport": 8080
          }
        ],
       "environment": [
          {
             "name": "AWS_REGION",
             "value": "${data.aws_region.current.name}"
          },
          {
             "name": "DEKART_POSTGRES_HOST",
             "value": "${aws_db_instance.dekart_db_instance.address}"
          },
          {
             "name": "DEKART_POSTGRES_PORT",
             "value": "${aws_db_instance.dekart_db_instance.port}"
          },
          {
             "name": "DEKART_POSTGRES_DB",
             "value": "${aws_db_instance.dekart_db_instance.db_name}"
          },
          {
             "name": "DEKART_POSTGRES_USER",
             "value": "dekart"
          },
          {
             "name": "DEKART_POSTGRES_PASSWORD",
             "value": "${aws_secretsmanager_secret_version.rds_credential_secret.secret_string}"
          },
          {
             "name": "DEKART_STORAGE",
             "value": "S3"
          },
          {
             "name": "DEKART_DATASOURCE",
             "value": "ATHENA"
          },
          {
             "name": "DEKART_CLOUD_STORAGE_BUCKET",
             "value": "${aws_s3_bucket.storage_bucket.id}"
          },
          {
             "name": "DEKART_ATHENA_CATALOG",
             "value": "AwsDataCatalog"
          },
          {
             "name": "DEKART_ATHENA_S3_OUTPUT_LOCATION",
             "value": "${aws_s3_bucket.storage_bucket.id}"
          },
          {
             "name": "DEKART_MAPBOX_TOKEN",
             "value": "${var.mapbox_token}"
          }
       ],
       "logconfiguration": {
          "logdriver": "awslogs",
          "secretoptions": null,
          "options": {
             "awslogs-group": "${aws_cloudwatch_log_group.log_group.name}",
             "awslogs-region": "${data.aws_region.current.name}",
             "awslogs-stream-prefix": "dekart"
          }
       }
    }
 ]
   TASK_DEFINITION
}

resource "aws_ecs_cluster" "ecs_cluster" {
  name = local.project
}

data "aws_vpc" "default_vpc" {
  default = true
}

data "aws_subnets" "subnets" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default_vpc.id]
  }
}


resource "aws_ecs_service" "ecs_service" {
  name                 = local.project
  cluster              = aws_ecs_cluster.ecs_cluster.id
  task_definition      = "${aws_ecs_task_definition.dekart.family}:${aws_ecs_task_definition.dekart.revision}"
  desired_count        = 1
  force_new_deployment = true
  launch_type          = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.subnets.ids
    assign_public_ip = false
  }

  #   load_balancer {
  #     target_group_arn = aws_alb_target_group.dekart.arn
  #     container_name   = local.project
  #     container_port   = 8080
  #   }
}


# resource "aws_ecs_service" "aws-ecs-service" {
#   name                 = local.project
#   cluster              = aws_ecs_cluster.aws-ecs-cluster.id
#   task_definition      = "${aws_ecs_task_definition.aws-ecs-task.family}:${aws_ecs_task_definition.aws-ecs-task.revision}"
#   desired_count        = 1
#   force_new_deployment = true

#   load_balancer {
#     target_group_arn = aws_alb_target_group.dekart.arn
#     container_name   = local.project
#     container_port   = 8080
#   }
# }

# resource "aws_ecs_task_definition" "definition" {
#   family                   = "project_name"
#   task_role_arn            = data.terraform_remote_state.env.outputs.ecs_task_role_arn
#   execution_role_arn       = data.terraform_remote_state.env.outputs.ecs_task_execution_role_arn
#   network_mode             = "awsvpc"
#   cpu                      = "256"
#   memory                   = "512"
#   requires_compatibilities = ["FARGATE"]
#   container_definitions    = <<TASK_DEFINITION
#   [
#     {
#       "cpu": 256,
#       "memory": 512,
#       "image": " .dkr.ecr.eu-central-1.amazonaws.com/project_name:${var.docker_image_tag}",
#         "environment": [
#             {"name": "JSON_LOGS", "value": "1"},
#             {"name": "PORT", "value": "80"},
#             {"name": "API_VERSION", "value": "${var.docker_image_tag}"},
#             {"name": "ENV", "value": "${terraform.workspace}"}
#         ],
#       "name": "project-container",
#       "portMappings": [
#         {
#           "containerPort": 80,
#           "hostPort": 80
#       }],
#       "logConfiguration": {
#                   "logDriver": "awslogs",
#                   "options": {
#                       "awslogs-region" : "eu-central-1",
#                       "awslogs-group" : "project_name-${terraform.workspace}",
#                       "awslogs-stream-prefix" : "project"
#                   }
#               }
#       }
#   ]
#   TASK_DEFINITION
# }

# resource "aws_ecs_service" "api" {
#   name                 = "project-api-${terraform.workspace}"
#   cluster              = data.terraform_remote_state.env.outputs.ecs_cluster_id
#   task_definition      = aws_ecs_task_definition.definition.arn
#   desired_count        = 1
#   launch_type          = "FARGATE"
#   force_new_deployment = true

#   network_configuration {
#     assign_public_ip = true
#     security_groups  = [data.terraform_remote_state.env.outputs.aws_sg]
#     subnets          = ["subnet-", "subnet-", "subnet-"]
#   }

#   load_balancer {
#     target_group_arn = aws_alb_target_group.api.arn
#     container_name   = "project-container"
#     container_port   = 80
#   }

#   lifecycle {
#     #ignore_changes = [task_definition, desired_count]
#   }

#   depends_on = [
#     aws_ecs_task_definition.definition,
#   ]
# }
