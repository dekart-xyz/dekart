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




# data "aws_region" "current" {}

# resource "aws_cloudwatch_log_group" "log_group" {
#   name              = local.project
#   retention_in_days = 7
# }

# resource "aws_iam_role" "task_role" {
#   name = "${local.project}-task-role"
#   assume_role_policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Effect = "Allow",
#         Action = "sts:AssumeRole",
#         Sid    = "",
#         Principal = {
#           Service = "ecs-tasks.amazonaws.com"
#         }
#       },
#     ]
#   })
#   inline_policy {
#     name = "${local.project}-task-policy"
#     policy = jsonencode({
#       Version = "2012-10-17",
#       Statement = [
#         {
#           Effect = "Allow",
#           Action = [
#             "s3:*"
#           ]
#           Resource = [
#             aws_s3_bucket.storage_bucket.arn,
#             "${aws_s3_bucket.storage_bucket.arn}/*",
#           ]
#         },
#         {
#           Effect = "Allow",
#           Action = [
#             "athena:CancelQueryExecution",
#             "athena:Get*",
#             "athena:StartQueryExecution",
#             "athena:StopQueryExecution",
#             "glue:Get*",
#           ],
#           Resource = [
#             "*"
#           ]
#         },
#         {
#           "Effect" : "Allow",
#           "Action" : [
#             "s3:ListBucket",
#             "s3:GetBucketLocation",
#             "s3:ListAllMyBuckets"
#           ],
#           "Resource" : [
#             "*"
#           ]
#         },
#         {
#           "Effect" : "Allow",
#           "Action" : [
#             "lakeformation:GetDataAccess"
#           ],
#           "Resource" : [
#             "*"
#           ]
#         },
#         {
#           "Effect" : "Allow",
#           "Action" : [
#             "s3:GetObject"
#           ],
#           "Resource" : flatten([
#             [for bucket in var.athena_s3_data_source : "arn:aws:s3:::${bucket}"]
#           ])
#         },
#       ]
#     })
#   }
# }

# resource "aws_iam_role" "execution_task_role" {
#   name = "${local.project}-execution-task-role"
#   managed_policy_arns = [
#     "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
#   ]
#   assume_role_policy = jsonencode({
#     Version = "2012-10-17"
#     Statement = [
#       {
#         Effect = "Allow",
#         Action = "sts:AssumeRole",
#         Sid    = "",
#         Principal = {
#           Service = "ecs-tasks.amazonaws.com"
#         }
#       },
#     ]
#   })
# }

# resource "aws_ecs_task_definition" "dekart_ecs_task" {
#   family                   = "dekart"
#   requires_compatibilities = ["FARGATE"]
#   network_mode             = "awsvpc"
#   cpu                      = "256"
#   memory                   = "512"
#   task_role_arn            = aws_iam_role.task_role.arn
#   execution_role_arn       = aws_iam_role.execution_task_role.arn
#   container_definitions    = <<TASK_DEFINITION
# [
#     {
#        "name": "${local.project}",
#        "image": "dekartxyz/dekart:0.8",
#        "portmappings": [
#           {
#             "hostport": 8080,
#             "protocol": "tcp",
#             "containerport": 8080
#           }
#         ],
#        "environment": [
#           {
#              "name": "DEKART_LOG_DEBUG",
#              "value": "1"
#           },
#           {
#              "name": "AWS_REGION",
#              "value": "${data.aws_region.current.name}"
#           },
#           {
#              "name": "DEKART_POSTGRES_HOST",
#              "value": "${aws_db_instance.dekart_db_instance.address}"
#           },
#           {
#              "name": "DEKART_POSTGRES_PORT",
#              "value": "${aws_db_instance.dekart_db_instance.port}"
#           },
#           {
#              "name": "DEKART_POSTGRES_DB",
#              "value": "${aws_db_instance.dekart_db_instance.db_name}"
#           },
#           {
#              "name": "DEKART_POSTGRES_USER",
#              "value": "dekart"
#           },
#           {
#              "name": "DEKART_POSTGRES_PASSWORD",
#              "value": "${aws_secretsmanager_secret_version.rds_credential_secret.secret_string}"
#           },
#           {
#              "name": "DEKART_STORAGE",
#              "value": "S3"
#           },
#           {
#              "name": "DEKART_DATASOURCE",
#              "value": "ATHENA"
#           },
#           {
#              "name": "DEKART_CLOUD_STORAGE_BUCKET",
#              "value": "${aws_s3_bucket.storage_bucket.id}"
#           },
#           {
#              "name": "DEKART_ATHENA_CATALOG",
#              "value": "AwsDataCatalog"
#           },
#           {
#              "name": "DEKART_ATHENA_S3_OUTPUT_LOCATION",
#              "value": "${aws_s3_bucket.storage_bucket.id}"
#           },
#           {
#              "name": "DEKART_MAPBOX_TOKEN",
#              "value": "${var.mapbox_token}"
#           }
#        ],
#        "logconfiguration": {
#           "logdriver": "awslogs",
#           "secretoptions": null,
#           "options": {
#              "awslogs-group": "${aws_cloudwatch_log_group.log_group.name}",
#              "awslogs-region": "${data.aws_region.current.name}",
#              "awslogs-stream-prefix": "dekart"
#           }
#        }
#     }
#  ]
#    TASK_DEFINITION
# }

# resource "aws_ecs_cluster" "ecs_cluster" {
#   name = local.project
# }

# # private and public subnets




# # NAT for private subnet for outbound traffic

# resource "aws_eip" "nat" {
#   count = 2
#   vpc   = true
# }

# resource "aws_nat_gateway" "main" {
#   count         = 2
#   allocation_id = element(aws_eip.nat.*.id, count.index)
#   subnet_id     = element(aws_subnet.public.*.id, count.index)
# }

# # route table for the private subnet to route through the NAT gateway

# resource "aws_route_table" "private" {
#   count  = 2
#   vpc_id = aws_vpc.main.id
# }

# resource "aws_route" "private" {
#   count                  = 2
#   route_table_id         = element(aws_route_table.private.*.id, count.index)
#   destination_cidr_block = "0.0.0.0/0"
#   nat_gateway_id         = element(aws_nat_gateway.main.*.id, count.index)
# }

# resource "aws_route_table_association" "private" {
#   count          = 2
#   subnet_id      = element(aws_subnet.private.*.id, count.index)
#   route_table_id = element(aws_route_table.private.*.id, count.index)
# }


# # load balancer

# # dns


# data "aws_route53_zone" "default_zone" {
#   name = var.default_zone_name
# }

# resource "aws_route53_record" "dekart_route53_record" {
#   name    = "${local.project}.${data.aws_route53_zone.default_zone.name}"
#   zone_id = data.aws_route53_zone.default_zone.zone_id
#   type    = "A"

#   alias {
#     name                   = aws_alb.dekart_alb.dns_name
#     zone_id                = aws_alb.dekart_alb.zone_id
#     evaluate_target_health = false
#   }
# }

# # certificate

# resource "aws_acm_certificate" "dekart_certificate" {

#   domain_name       = aws_route53_record.dekart_route53_record.name
#   validation_method = "DNS"

#   lifecycle {
#     create_before_destroy = true
#   }
# }

# resource "aws_route53_record" "dekart_certificate_validation" {
#   for_each = {
#     for dvo in aws_acm_certificate.dekart_certificate.domain_validation_options : dvo.domain_name => {
#       name   = dvo.resource_record_name
#       record = dvo.resource_record_value
#       type   = dvo.resource_record_type
#     }
#   }
#   allow_overwrite = true
#   name            = each.value.name
#   records         = [each.value.record]
#   ttl             = 60
#   type            = each.value.type
#   zone_id         = aws_route53_record.dekart_route53_record.zone_id
# }

# resource "aws_acm_certificate_validation" "dekart_certificate_validation" {
#   certificate_arn         = aws_acm_certificate.dekart_certificate.arn
#   validation_record_fqdns = [for record in aws_route53_record.dekart_certificate_validation : record.fqdn]
# }

# # ECS Service

# resource "aws_ecs_service" "dekart_ecs_service" {
#   name                 = local.project
#   cluster              = aws_ecs_cluster.ecs_cluster.id
#   task_definition      = "${aws_ecs_task_definition.dekart_ecs_task.family}:${aws_ecs_task_definition.dekart_ecs_task.revision}"
#   desired_count        = 1
#   force_new_deployment = true
#   launch_type          = "FARGATE"

#   network_configuration {
#     security_groups  = [aws_security_group.dekart_private.id]
#     subnets          = aws_subnet.private.*.id
#     assign_public_ip = false
#   }

#   load_balancer {
#     target_group_arn = aws_alb_target_group.dekart_target_group.arn
#     container_name   = local.project
#     container_port   = 8080
#   }
# }

