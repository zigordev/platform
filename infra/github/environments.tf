resource "github_repository_environment" "release" {
  for_each = local.repos

  repository          = github_repository.repo[each.key].name
  environment         = local.release.environment
  can_admins_bypass   = true
  prevent_self_review = false

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "release_main" {
  for_each = local.repos

  repository     = github_repository.repo[each.key].name
  environment    = github_repository_environment.release[each.key].environment
  branch_pattern = local.release.branch
}

resource "github_repository_environment" "production" {
  for_each = { for name, repo in local.repos : name => repo if repo.deploys }

  repository          = github_repository.repo[each.key].name
  environment         = local.production.environment
  can_admins_bypass   = true
  prevent_self_review = false

  deployment_branch_policy {
    protected_branches     = false
    custom_branch_policies = true
  }
}

resource "github_repository_environment_deployment_policy" "production_main" {
  for_each = github_repository_environment.production

  repository     = each.value.repository
  environment    = each.value.environment
  branch_pattern = local.production.branch
}
