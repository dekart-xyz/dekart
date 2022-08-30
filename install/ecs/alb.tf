
resource "aws_alb" "dekart" {
  name               = local.project
  load_balancer_type = "application"
  security_groups    = [aws_security_group.dekart_private.id, aws_security_group.dekart_alb.id]
  subnets            = aws_subnet.public.*.id
}

resource "aws_alb_target_group" "dekart" {
  name        = local.project
  port        = "8080"
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"
}

# dns zone record

data "aws_route53_zone" "main" {
  name = var.zone_name
}

resource "aws_route53_record" "dekart" {
  name    = "${local.project}.${data.aws_route53_zone.main.name}"
  zone_id = data.aws_route53_zone.main.zone_id
  type    = "A"

  alias {
    name                   = aws_alb.dekart.dns_name
    zone_id                = aws_alb.dekart.zone_id
    evaluate_target_health = false
  }
}

# certificate

resource "aws_acm_certificate" "dekart" {

  domain_name       = aws_route53_record.dekart.name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "dekart_certificate_validation" {
  for_each = {
    for dvo in aws_acm_certificate.dekart.domain_validation_options : dvo.domain_name => {
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
  zone_id         = aws_route53_record.dekart.zone_id
}

resource "aws_acm_certificate_validation" "dekart" {
  certificate_arn         = aws_acm_certificate.dekart.arn
  validation_record_fqdns = [for record in aws_route53_record.dekart_certificate_validation : record.fqdn]
}

# listeners

resource "aws_alb_listener" "dekart_http" {
  load_balancer_arn = aws_alb.dekart.arn
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

resource "aws_alb_listener" "dekart_https" {
  load_balancer_arn = aws_alb.dekart.arn
  port              = 443
  protocol          = "HTTPS"

  ssl_policy      = "ELBSecurityPolicy-2016-08"
  certificate_arn = aws_acm_certificate.dekart.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.dekart.arn
  }
}

resource "aws_alb_listener_rule" "dekart_listener_rule" {

  listener_arn = aws_alb_listener.dekart_https.arn

  action {
    type = "authenticate-cognito"

    # configuration example https://beabetterdev.com/2021/08/16/how-to-add-google-social-sign-on-to-your-amazon-cognito-user-pool/
    authenticate_cognito {
      scope               = "email openid"
      user_pool_arn       = var.user_pool_arn
      user_pool_client_id = var.user_pool_client_id
      user_pool_domain    = var.user_pool_domain
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_alb_target_group.dekart.arn
  }

  condition {
    path_pattern {
      values = ["/*"]
    }
  }
}
