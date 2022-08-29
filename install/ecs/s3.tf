
# bucket to store queries and cache query results
resource "aws_s3_bucket" "dekart_output" {
  bucket = "${var.dekart_deployment_name}-output"
}
