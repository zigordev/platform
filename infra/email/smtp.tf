resource "aws_iam_user" "smtp" {
  name = local.smtp.user
}

resource "aws_iam_user_policy" "smtp" {
  name = "send-as-${local.domain}"
  user = aws_iam_user.smtp.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ses:SendRawEmail"
        Resource = aws_sesv2_email_identity.domain.arn
      }
    ]
  })
}

resource "terraform_data" "smtp_rotation" {
  input = local.smtp.rotation
}

resource "aws_iam_access_key" "smtp" {
  user = aws_iam_user.smtp.name

  lifecycle {
    create_before_destroy = true
    replace_triggered_by  = [terraform_data.smtp_rotation]
  }
}
