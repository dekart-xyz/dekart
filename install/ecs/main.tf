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
  region = var.region
}

# data "aws_region" "current" {}




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




# # ECS Service

