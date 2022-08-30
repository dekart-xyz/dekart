
# let the ecs, rds and alb to connect to each other
resource "aws_security_group" "dekart_private" {
  name   = "${local.project}-private"
  vpc_id = aws_vpc.main.id

  # connection within the group
  ingress {
    from_port = 0
    to_port   = 0
    protocol  = "-1"
    self      = true
  }

  # connecting to outside
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

# allow connections to load balancer
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

  lifecycle { create_before_destroy = true }
}
