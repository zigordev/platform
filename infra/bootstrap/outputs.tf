output "state_bucket" {
  description = "The bucket that holds the OpenTofu state of every stack in platform"
  value       = aws_s3_bucket.state.bucket
}

output "state_key_alias" {
  description = "The KMS key that encrypts that state"
  value       = aws_kms_alias.state.name
}

output "plan_role_name" {
  description = "The read-only role the pipeline signs in to for a plan"
  value       = aws_iam_role.plan.name
}

output "apply_role_name" {
  description = "The role the pipeline signs in to for an apply, after the owner's approval"
  value       = aws_iam_role.apply.name
}
