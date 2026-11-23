data "aws_ssm_parameter" "app_key" {
  name = local.app.key_parameter
}
