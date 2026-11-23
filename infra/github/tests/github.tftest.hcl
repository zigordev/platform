variables {
  adopt_existing = false
}

mock_provider "aws" {
  mock_data "aws_ssm_parameter" {
    defaults = {
      value = "not-a-real-key"
    }
  }
}

mock_provider "github" {}

run "every_repo_merges_by_squash_only_and_cleans_up_its_branches" {
  command = plan

  assert {
    condition = alltrue([
      for repo in github_repository.repo :
      repo.allow_squash_merge && !repo.allow_merge_commit && !repo.allow_rebase_merge
    ])
    error_message = "Every repo merges by squash only."
  }

  assert {
    condition = alltrue([
      for repo in github_repository.repo :
      repo.squash_merge_commit_title == "PR_TITLE" && repo.squash_merge_commit_message == "PR_BODY"
    ])
    error_message = "A squash commit takes the pull request's title and description."
  }

  assert {
    condition = alltrue([
      for repo in github_repository.repo :
      repo.delete_branch_on_merge && repo.allow_auto_merge && repo.visibility == "public"
    ])
    error_message = "Every repo is public, allows auto-merge and deletes a branch after its merge."
  }
}

run "a_repo_is_archived_never_deleted" {
  command = plan

  assert {
    condition     = alltrue([for repo in github_repository.repo : repo.archive_on_destroy])
    error_message = "Removing a repo from the code must archive it, never delete it."
  }
}

run "every_repo_scans_for_secrets_and_reports_flawed_dependencies" {
  command = plan

  assert {
    condition = alltrue([
      for repo in github_repository.repo :
      repo.security_and_analysis[0].secret_scanning[0].status == "enabled" &&
      repo.security_and_analysis[0].secret_scanning_push_protection[0].status == "enabled"
    ])
    error_message = "Secret scanning and push protection stay on in every repo."
  }

  assert {
    condition     = alltrue([for alerts in github_repository_vulnerability_alerts.alerts : alerts.enabled])
    error_message = "Dependabot alerts stay on in every repo."
  }

  assert {
    condition     = alltrue([for updates in github_repository_dependabot_security_updates.updates : !updates.enabled])
    error_message = "Renovate updates dependencies, so Dependabot's own update pull requests stay off."
  }
}

run "the_workflow_token_only_reads_and_never_approves" {
  command = plan

  assert {
    condition = alltrue([
      for token in github_workflow_repository_permissions.token :
      token.default_workflow_permissions == "read" && !token.can_approve_pull_request_reviews
    ])
    error_message = "A workflow's token reads only, and can never approve a pull request."
  }
}

run "main_takes_only_a_squashed_pull_request_with_a_green_check" {
  command = plan

  assert {
    condition = alltrue([
      for ruleset in github_repository_ruleset.main :
      ruleset.enforcement == "active" && length(ruleset.bypass_actors) == 0 &&
      toset(ruleset.conditions[0].ref_name[0].include) == toset(["~DEFAULT_BRANCH"])
    ])
    error_message = "The ruleset guards the default branch, is active, and nobody can bypass it."
  }

  assert {
    condition = alltrue([
      for ruleset in github_repository_ruleset.main :
      ruleset.rules[0].deletion && ruleset.rules[0].non_fast_forward && ruleset.rules[0].required_linear_history
    ])
    error_message = "main can be neither deleted nor force-pushed, and its history stays linear."
  }

  assert {
    condition = alltrue([
      for ruleset in github_repository_ruleset.main :
      toset(ruleset.rules[0].pull_request[0].allowed_merge_methods) == toset(["squash"])
    ])
    error_message = "A change reaches main only through a squashed pull request."
  }

  assert {
    condition = alltrue([
      for ruleset in github_repository_ruleset.main :
      toset([for check in ruleset.rules[0].required_status_checks[0].required_check : "${check.context}@${check.integration_id}"]) == toset(["check@15368"])
    ])
    error_message = "The one required check is the job named check, reported by GitHub Actions."
  }
}

run "packages_are_published_from_main_only" {
  command = plan

  assert {
    condition = alltrue([
      for environment in github_repository_environment.release :
      environment.environment == "release" &&
      environment.deployment_branch_policy[0].custom_branch_policies &&
      !environment.deployment_branch_policy[0].protected_branches
    ])
    error_message = "The environment release runs only from the branches its policy names."
  }

  assert {
    condition     = alltrue([for policy in github_repository_environment_deployment_policy.release_main : policy.branch_pattern == "main"])
    error_message = "The environment release runs from main only."
  }
}

run "every_repo_has_the_label_that_lets_a_destructive_migration_through" {
  command = plan

  assert {
    condition     = alltrue([for label in github_issue_label.destructive_migration : label.name == "destructive-migration"])
    error_message = "Every repo has the label destructive-migration, which the migrations rule reads."
  }
}

run "every_repo_in_the_list_gets_every_setting" {
  command = plan

  assert {
    condition = alltrue([
      for settings in [
        github_repository_ruleset.main,
        github_repository_environment.release,
        github_repository_environment_deployment_policy.release_main,
        github_workflow_repository_permissions.token,
        github_repository_vulnerability_alerts.alerts,
        github_repository_dependabot_security_updates.updates,
        github_issue_label.destructive_migration,
      ] : toset(keys(settings)) == toset(keys(github_repository.repo))
    ])
    error_message = "Each repo in local.repos gets the ruleset, the environment, the token, the alerts and the label."
  }
}
