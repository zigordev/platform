resource "aws_iam_role_policy" "host" {
  name = "backups"
  role = local.host_role

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "AddAndReadTheDumps"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${local.bucket_arn}/*"
      },
      {
        Sid      = "ListTheDumps"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = local.bucket_arn
      },
      {
        Sid      = "EncryptAndReadWithTheKey"
        Effect   = "Allow"
        Action   = ["kms:GenerateDataKey", "kms:Decrypt"]
        Resource = aws_kms_key.backups.arn
      },
    ]
  })
}
