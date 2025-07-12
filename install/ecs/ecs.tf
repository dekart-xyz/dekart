
resource "aws_cloudwatch_log_group" "dekart" {
  name              = var.dekart_deployment_name
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "dekart" {
  family                   = "dekart"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  task_role_arn            = aws_iam_role.dekart_task.arn
  execution_role_arn       = aws_iam_role.dekart_execution.arn
  container_definitions    = <<TASK_DEFINITION
[
    {
       "name": "${var.dekart_deployment_name}",
       "image": "dekartxyz/dekart:${var.dekart_version}",
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
             "value": "${var.region}"
          },
          {
             "name": "DEKART_POSTGRES_HOST",
             "value": "${aws_db_instance.dekart.address}"
          },
          {
             "name": "DEKART_POSTGRES_PORT",
             "value": "${aws_db_instance.dekart.port}"
          },
          {
             "name": "DEKART_POSTGRES_DB",
             "value": "${aws_db_instance.dekart.db_name}"
          },
          {
             "name": "DEKART_POSTGRES_USER",
             "value": "dekart"
          },
          {
             "name": "DEKART_POSTGRES_PASSWORD",
             "value": "${aws_secretsmanager_secret_version.dekart_rds.secret_string}"
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
             "value": "${aws_s3_bucket.dekart_output.id}"
          },
          {
             "name": "DEKART_ATHENA_CATALOG",
             "value": "${var.athena_catalog}"
          },
          {
             "name": "DEKART_ATHENA_S3_OUTPUT_LOCATION",
             "value": "${aws_s3_bucket.dekart_output.id}"
          },
          {
             "name": "DEKART_ATHENA_WORKGROUP",
             "value": "${var.athena_workgroup}"
          },
          {
             "name": "DEKART_MAPBOX_TOKEN",
             "value": "${var.mapbox_token}"
          },
          {
             "name": "DEKART_CORS_ORIGIN",
             "value": "https://${aws_route53_record.dekart.name}"
          },
          {
             "name": "DEKART_ALLOW_FILE_UPLOAD",
             "value": "1"
          }
       ],
       "logconfiguration": {
          "logdriver": "awslogs",
          "secretoptions": null,
          "options": {
             "awslogs-group": "${aws_cloudwatch_log_group.dekart.name}",
             "awslogs-region": "${var.region}",
             "awslogs-stream-prefix": "dekart"
          }
       }
    }
 ]
   TASK_DEFINITION
}

resource "aws_ecs_cluster" "dekart" {
  name = var.dekart_deployment_name
}

resource "aws_ecs_service" "dekart" {
  name                 = var.dekart_deployment_name
  cluster              = aws_ecs_cluster.dekart.id
  task_definition      = "${aws_ecs_task_definition.dekart.family}:${aws_ecs_task_definition.dekart.revision}"
  desired_count        = 1 # important, dekart does not scale horizontally
  force_new_deployment = true
  launch_type          = "FARGATE"

  network_configuration {
    # becouse dekart is proxying big files from the S3 we do not put it behind the NAT
    # we keep it in public net, but it is not accessible from outside because of security group rule
    # see general recommendations https://aws.amazon.com/de/blogs/compute/task-networking-in-aws-fargate/
    security_groups  = [aws_security_group.dekart_private.id]
    subnets          = aws_subnet.public.*.id
    assign_public_ip = true # it is necessarily to access Internet from task without NAT
  }

  load_balancer {
    target_group_arn = aws_alb_target_group.dekart.arn
    container_name   = var.dekart_deployment_name
    container_port   = 8080
  }
}



