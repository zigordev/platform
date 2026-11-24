resource "aws_iam_role" "deploy" {
  for_each = local.targets

  name                 = "platform-deploy-${each.key}"
  description          = "Lets main of zigordev/${each.value.repo} ask the host to run one of its commits, and nothing else"
  max_session_duration = 3600

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = "sts:AssumeRoleWithWebIdentity"
        Principal = { Federated = "arn:aws:iam::${local.account_id}:oidc-provider/token.actions.githubusercontent.com" }
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = "repo:${local.github.owner}@${local.github.owner_id}/${each.value.repo}@${each.value.repo_id}:environment:${local.github.environment}"
          }
        }
      },
    ]
  })
}

resource "aws_iam_role_policy" "deploy" {
  for_each = local.targets

  name = "send-the-deploy-command"
  role = aws_iam_role.deploy[each.key].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SendItsOwnCommand"
        Effect   = "Allow"
        Action   = "ssm:SendCommand"
        Resource = "arn:aws:ssm:${local.region}:${local.account_id}:document/${aws_ssm_document.deploy[each.key].name}"
      },
      {
        Sid      = "ToTheHostOnly"
        Effect   = "Allow"
        Action   = "ssm:SendCommand"
        Resource = "arn:aws:ec2:${local.region}:${local.account_id}:instance/*"
        Condition = {
          StringEquals = { "ssm:resourceTag/Name" = local.host_tag }
        }
      },
      {
        Sid      = "ReadTheResult"
        Effect   = "Allow"
        Action   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
        Resource = "*"
      },
    ]
  })
}
