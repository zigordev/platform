resource "aws_iam_role_policy" "host" {
  name = "deploy"
  role = local.host_role

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadTheSecretsOfEachTarget"
        Effect = "Allow"
        Action = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = flatten([
          for target in values(local.targets) : [
            for parameter in target.parameters : "arn:aws:ssm:${local.region}:${local.account_id}:parameter/${parameter}"
          ]
        ])
      },
      {
        Sid      = "KeepTheRecords"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:PutParameter"]
        Resource = "arn:aws:ssm:${local.region}:${local.account_id}:parameter${local.records}/*"
      },
      {
        Sid      = "ListTheRecords"
        Effect   = "Allow"
        Action   = "ssm:GetParametersByPath"
        Resource = "arn:aws:ssm:${local.region}:${local.account_id}:parameter${local.records}"
      },
    ]
  })
}
