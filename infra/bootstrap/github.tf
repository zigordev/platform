resource "github_repository_environment" "infrastructure" {
  repository          = local.github_repo
  environment         = local.apply_environment
  can_admins_bypass   = false
  prevent_self_review = false

  reviewers {
    users = [local.github_owner_id]
  }

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "infrastructure_main" {
  repository     = local.github_repo
  environment    = github_repository_environment.infrastructure.environment
  branch_pattern = "main"
}
