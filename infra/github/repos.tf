resource "github_repository" "repo" {
  for_each = local.repos

  name        = each.key
  description = each.value.description
  visibility  = "public"

  has_issues      = true
  has_projects    = true
  has_wiki        = true
  has_discussions = false

  allow_merge_commit          = false
  allow_rebase_merge          = false
  allow_squash_merge          = true
  squash_merge_commit_title   = "PR_TITLE"
  squash_merge_commit_message = "PR_BODY"
  allow_auto_merge            = true
  allow_update_branch         = false
  delete_branch_on_merge      = true
  web_commit_signoff_required = false

  archive_on_destroy = true

  security_and_analysis {
    secret_scanning {
      status = "enabled"
    }

    secret_scanning_push_protection {
      status = "enabled"
    }
  }
}

resource "github_repository_vulnerability_alerts" "alerts" {
  for_each = local.repos

  repository = github_repository.repo[each.key].name
  enabled    = true
}

resource "github_repository_dependabot_security_updates" "updates" {
  for_each = local.repos

  repository = github_repository.repo[each.key].name
  enabled    = false

  depends_on = [github_repository_vulnerability_alerts.alerts]
}

resource "github_workflow_repository_permissions" "token" {
  for_each = local.repos

  repository                       = github_repository.repo[each.key].name
  default_workflow_permissions     = "read"
  can_approve_pull_request_reviews = false
}

resource "github_issue_label" "destructive_migration" {
  for_each = local.repos

  repository  = github_repository.repo[each.key].name
  name        = local.destructive_migration.name
  color       = local.destructive_migration.color
  description = local.destructive_migration.description
}
