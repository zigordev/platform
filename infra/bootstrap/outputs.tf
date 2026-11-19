output "state_bucket" {
  value = aws_s3_bucket.state.id
}

output "state_key_alias" {
  value = aws_kms_alias.state.name
}

output "plan_role_arn" {
  value = aws_iam_role.plan.arn
}

output "apply_role_arn" {
  value = aws_iam_role.apply.arn
}
