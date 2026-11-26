locals {
  smtp_parameters = {
    NOTIFICATIONS_API_SMTP_USER     = "The notifications service signs in to SES's SMTP endpoint with this user: the id of the key of the IAM user notifications-smtp"
    NOTIFICATIONS_API_SMTP_PASSWORD = "The notifications service signs in to SES's SMTP endpoint with this password, which the code made from that key's secret"
  }

  smtp_values = {
    NOTIFICATIONS_API_SMTP_USER     = aws_iam_access_key.smtp.id
    NOTIFICATIONS_API_SMTP_PASSWORD = aws_iam_access_key.smtp.ses_smtp_password_v4
  }
}

resource "aws_ssm_parameter" "smtp" {
  for_each = local.smtp_parameters

  name        = "/${local.smtp.product}/${each.key}"
  description = each.value
  type        = "SecureString"
  value       = local.smtp_values[each.key]
}
