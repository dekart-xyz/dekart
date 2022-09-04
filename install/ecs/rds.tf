
# generate and store password in secret manager

resource "random_password" "dekart_rds" {
  length  = 16
  special = false
}

resource "aws_secretsmanager_secret" "dekart_rds" {
  name = "${var.dekart_deployment_name}-rds"
}

resource "aws_secretsmanager_secret_version" "dekart_rds" {
  secret_id     = aws_secretsmanager_secret.dekart_rds.id
  secret_string = random_password.dekart_rds.result
  lifecycle {
    ignore_changes = [
      secret_string
    ]
  }
}

# subnet group

resource "aws_db_subnet_group" "dekart_rds" {
  name       = "${var.dekart_deployment_name}-rds"
  subnet_ids = aws_subnet.private.*.id
}

# rds

resource "aws_db_instance" "dekart" {
  identifier                  = var.dekart_deployment_name
  allocated_storage           = 20 # min size for gp2 storage_type type
  storage_type                = "gp2"
  engine                      = "postgres"
  engine_version              = "14.1"
  instance_class              = "db.t3.micro"
  db_name                     = var.dekart_rds_db_name
  username                    = var.dekart_rds_username
  password                    = aws_secretsmanager_secret_version.dekart_rds.secret_string
  allow_major_version_upgrade = false
  auto_minor_version_upgrade  = true
  port                        = 5432
  publicly_accessible         = false
  storage_encrypted           = true
  vpc_security_group_ids      = [aws_security_group.dekart_private.id]
  db_subnet_group_name        = aws_db_subnet_group.dekart_rds.name
  skip_final_snapshot         = true

  lifecycle {
    ignore_changes = [
      password
    ]
  }
}

