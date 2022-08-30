
# ecs task role
resource "aws_iam_role" "dekart_task" {
  name = "${local.project}-task"
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
  inline_policy {
    name = "${local.project}-task-policy"
    policy = jsonencode({
      Version = "2012-10-17",
      Statement = [
        {
          Effect = "Allow",
          Action = [
            "s3:*"
          ]
          Resource = [
            aws_s3_bucket.dekart_output.arn,
            "${aws_s3_bucket.dekart_output.arn}/*",
          ]
        },
        {
          Effect = "Allow",
          Action = [
            "athena:CancelQueryExecution",
            "athena:Get*",
            "athena:StartQueryExecution",
            "athena:StopQueryExecution",
            "glue:Get*",
          ],
          Resource = [
            "*"
          ]
        },
        {
          "Effect" : "Allow",
          "Action" : [
            "s3:ListBucket",
            "s3:GetBucketLocation",
            "s3:ListAllMyBuckets"
          ],
          "Resource" : [
            "*"
          ]
        },
        {
          "Effect" : "Allow",
          "Action" : [
            "lakeformation:GetDataAccess"
          ],
          "Resource" : [
            "*"
          ]
        },
        {
          "Effect" : "Allow",
          "Action" : [
            "s3:GetObject"
          ],
          "Resource" : flatten([
            [for bucket in var.athena_s3_data_source : "arn:aws:s3:::${bucket}"]
          ])
        },
      ]
    })
  }
}

# ecs execution role
resource "aws_iam_role" "dekart_execution" {
  name = "${local.project}-execution"
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

