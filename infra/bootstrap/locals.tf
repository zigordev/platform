locals {
  region = "eu-west-1"

  tags = {
    managed-by = "opentofu"
    repo       = "zigordev/platform"
    stack      = "bootstrap"
  }

  state_bucket    = "zigordev-platform-opentofu-state"
  state_key_alias = "alias/platform-opentofu-state"

  github_owner    = "zigordev"
  github_owner_id = 261390829
  github_repo     = "platform"
  github_repo_id  = 1467993346

  oidc_subject_prefix = "repo:${local.github_owner}@${local.github_owner_id}/${local.github_repo}@${local.github_repo_id}"
  apply_environment   = "infrastructure"

  plan_subjects = [
    "${local.oidc_subject_prefix}:pull_request",
    "${local.oidc_subject_prefix}:ref:refs/heads/main",
  ]
  apply_subjects = [
    "${local.oidc_subject_prefix}:environment:${local.apply_environment}",
  ]

  alert_email_parameter = "/platform/ALERT_EMAIL"
  monthly_budget_usd    = 45
  anomaly_threshold_usd = 5
}
