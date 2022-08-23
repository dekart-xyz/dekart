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
  length  = 16
  special = false
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

resource "aws_db_subnet_group" "dekart_rds_subnet_group" {
  name       = "${local.project}-rds-subnet-group"
  subnet_ids = aws_subnet.private.*.id
}

resource "aws_db_instance" "dekart_db_instance" {
  identifier                  = "${local.project}-rds"
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
  vpc_security_group_ids      = [aws_security_group.dekart_private.id]
  db_subnet_group_name        = aws_db_subnet_group.dekart_rds_subnet_group.name
  skip_final_snapshot         = true

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

resource "aws_ecs_task_definition" "dekart_ecs_task" {
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
             "name": "DEKART_LOG_DEBUG",
             "value": "1"
          },
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

# VPC

resource "aws_vpc" "main" {
  cidr_block = "172.31.0.0/16"
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
}

data "aws_availability_zones" "available" {
  state = "available"
}

# private and public subnets

resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = element(["172.31.0.0/24", "172.31.1.0/24"], count.index)
  availability_zone = element(data.aws_availability_zones.available.names, count.index)
  count             = 2
}

resource "aws_subnet" "public" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = element(["172.31.2.0/24", "172.31.3.0/24"], count.index)
  availability_zone = element(data.aws_availability_zones.available.names, count.index)
  count             = 2
}

# route public subnet via internet gateway

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
}

resource "aws_route" "public" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = element(aws_subnet.public.*.id, count.index)
  route_table_id = aws_route_table.public.id
}

# NAT for private subnet for outbound traffic

resource "aws_eip" "nat" {
  count = 2
  vpc   = true
}

resource "aws_nat_gateway" "main" {
  count         = 2
  allocation_id = element(aws_eip.nat.*.id, count.index)
  subnet_id     = element(aws_subnet.public.*.id, count.index)
}

# route table for the private subnet to route through the NAT gateway

resource "aws_route_table" "private" {
  count  = 2
  vpc_id = aws_vpc.main.id
}

resource "aws_route" "private" {
  count                  = 2
  route_table_id         = element(aws_route_table.private.*.id, count.index)
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = element(aws_nat_gateway.main.*.id, count.index)
}

resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = element(aws_subnet.private.*.id, count.index)
  route_table_id = element(aws_route_table.private.*.id, count.index)
}

# security group for rds

resource "aws_security_group" "dekart_private" {
  name   = "${local.project}-private"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    self      = true
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  # https://github.com/hashicorp/terraform-provider-aws/issues/265
  lifecycle { create_before_destroy = true }
}

# security group for alb (load balancer)

resource "aws_security_group" "dekart_alb" {
  name   = "${local.project}-alb"
  vpc_id = aws_vpc.main.id

  ingress {
    protocol         = "tcp"
    from_port        = 80
    to_port          = 80
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  ingress {
    protocol         = "tcp"
    from_port        = 443
    to_port          = 443
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  egress {
    protocol         = "-1"
    from_port        = 0
    to_port          = 0
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }
}

# load balancer

resource "aws_alb" "dekart_alb" {
  name               = local.project
  load_balancer_type = "application"
  security_groups    = [aws_security_group.dekart_private.id, aws_security_group.dekart_alb.id]
  subnets            = aws_subnet.public.*.id
}

# dns

variable "default_zone_name" {}

data "aws_route53_zone" "default_zone" {
  name = var.default_zone_name
}

resource "aws_route53_record" "dekart_route53_record" {
  name    = "${local.project}.${data.aws_route53_zone.default_zone.name}"
  zone_id = data.aws_route53_zone.default_zone.zone_id
  type    = "A"

  alias {
    name                   = aws_alb.dekart_alb.dns_name
    zone_id                = aws_alb.dekart_alb.zone_id
    evaluate_target_health = false
  }
}

# certificate

resource "aws_acm_certificate" "dekart_certificate" {

  domain_name       = aws_route53_record.dekart_route53_record.name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "dekart_certificate_validation" {
  for_each = {
    for dvo in aws_acm_certificate.dekart_certificate.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }
  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_record.dekart_route53_record.zone_id
}

resource "aws_acm_certificate_validation" "dekart_certificate_validation" {
  certificate_arn         = aws_acm_certificate.dekart_certificate.arn
  validation_record_fqdns = [for record in aws_route53_record.dekart_certificate_validation : record.fqdn]
}

resource "aws_alb_target_group" "dekart_target_group" {
  name        = local.project
  port        = "8080"
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"
}

resource "aws_alb_listener" "dekart_listener_http" {
  load_balancer_arn = aws_alb.dekart_alb.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = 443
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_alb_listener" "dekart_listener_https" {
  load_balancer_arn = aws_alb.dekart_alb.arn
  port              = 443
  protocol          = "HTTPS"

  ssl_policy      = "ELBSecurityPolicy-2016-08"
  certificate_arn = aws_acm_certificate.dekart_certificate.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.dekart_target_group.arn
  }
}

# ECS Service

resource "aws_ecs_service" "dekart_ecs_service" {
  name                 = local.project
  cluster              = aws_ecs_cluster.ecs_cluster.id
  task_definition      = "${aws_ecs_task_definition.dekart_ecs_task.family}:${aws_ecs_task_definition.dekart_ecs_task.revision}"
  desired_count        = 1
  force_new_deployment = true
  launch_type          = "FARGATE"

  network_configuration {
    security_groups  = [aws_security_group.dekart_private.id]
    subnets          = aws_subnet.private.*.id
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_alb_target_group.dekart_target_group.arn
    container_name   = local.project
    container_port   = 8080
  }
}
