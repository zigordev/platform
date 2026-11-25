resource "aws_sesv2_email_identity" "domain" {
  email_identity = local.domain

  dkim_signing_attributes {
    next_signing_key_length = local.dkim.key_length
  }
}
