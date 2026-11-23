mock_provider "aws" {
  mock_data "aws_ssm_parameter" {
    defaults = {
      value = "alerts@example.com"
    }
  }

  mock_resource "aws_iam_openid_connect_provider" {
    defaults = {
      arn = "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
    }
  }

  mock_resource "aws_kms_key" {
    defaults = {
      arn    = "arn:aws:kms:eu-west-1:111122223333:key/11111111-2222-3333-4444-555555555555"
      key_id = "11111111-2222-3333-4444-555555555555"
    }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::zigordev-platform-opentofu-state"
      id  = "zigordev-platform-opentofu-state"
    }
  }
}

mock_provider "aws" {
  alias = "us_east_1"

  mock_resource "aws_ce_anomaly_monitor" {
    defaults = {
      arn = "arn:aws:ce::111122223333:anomalymonitor/11111111-2222-3333-4444-555555555555"
    }
  }
}

mock_provider "github" {}

run "the_plan_role_trusts_only_pull_requests_and_main" {
  assert {
    condition = jsondecode(aws_iam_role.plan.assume_role_policy).Statement[0].Condition.StringEquals == {
      "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
      "token.actions.githubusercontent.com:sub" = [
        "repo:zigordev@261390829/platform@1467993346:pull_request",
        "repo:zigordev@261390829/platform@1467993346:ref:refs/heads/main",
      ]
    }
    error_message = "The plan role must trust only this repo's pull requests and its main branch, in GitHub's immutable subject form."
  }

  assert {
    condition     = length(jsondecode(aws_iam_role.plan.assume_role_policy).Statement) == 1
    error_message = "The plan role must have exactly one way in."
  }

  assert {
    condition     = aws_iam_role_policy_attachment.plan_read_only.policy_arn == "arn:aws:iam::aws:policy/ReadOnlyAccess"
    error_message = "The plan role must be able to read, and nothing more, apart from the state lock."
  }
}

run "the_plan_role_may_write_only_the_lock" {
  assert {
    condition = [
      for statement in jsondecode(aws_iam_role_policy.plan_state.policy).Statement : statement.Resource
      if contains(statement.Action, "s3:PutObject")
    ] == ["arn:aws:s3:::zigordev-platform-opentofu-state/*.tflock"]
    error_message = "The plan role may write the lock file of the state, and no other object."
  }
}

run "the_apply_role_trusts_only_the_approved_environment" {
  assert {
    condition = jsondecode(aws_iam_role.apply.assume_role_policy).Statement[0].Condition.StringEquals == {
      "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
      "token.actions.githubusercontent.com:sub" = [
        "repo:zigordev@261390829/platform@1467993346:environment:infrastructure",
      ]
    }
    error_message = "The apply role must trust only a job that runs in the environment infrastructure, which waits for the owner."
  }

  assert {
    condition     = aws_iam_role_policy_attachment.apply_administrator.policy_arn == "arn:aws:iam::aws:policy/AdministratorAccess"
    error_message = "The apply role changes anything the infrastructure code describes."
  }

  assert {
    condition     = aws_iam_role.apply.max_session_duration == 3600 && aws_iam_role.plan.max_session_duration == 3600
    error_message = "A sign-in from the pipeline lasts one hour at most."
  }
}

run "the_environment_waits_for_the_owner_and_runs_from_main_only" {
  assert {
    condition     = github_repository_environment.infrastructure.environment == "infrastructure"
    error_message = "The apply role's trust names this environment, so the names must match."
  }

  assert {
    condition     = one(github_repository_environment.infrastructure.reviewers).users == toset([261390829])
    error_message = "The owner must approve every apply."
  }

  assert {
    condition     = github_repository_environment.infrastructure.can_admins_bypass == false
    error_message = "Nobody may skip the approval, an administrator included."
  }

  assert {
    condition     = github_repository_environment_deployment_policy.infrastructure_main.branch_pattern == "main"
    error_message = "Only main may run in the environment."
  }
}

run "the_state_is_private_versioned_and_encrypted_with_its_own_key" {
  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.state.block_public_acls,
      aws_s3_bucket_public_access_block.state.block_public_policy,
      aws_s3_bucket_public_access_block.state.ignore_public_acls,
      aws_s3_bucket_public_access_block.state.restrict_public_buckets,
    ])
    error_message = "The state bucket must block every kind of public access."
  }

  assert {
    condition     = one(aws_s3_bucket_versioning.state.versioning_configuration).status == "Enabled"
    error_message = "Every earlier state must be kept, so a bad apply can be undone."
  }

  assert {
    condition = one([
      for rule in aws_s3_bucket_server_side_encryption_configuration.state.rule :
      one(rule.apply_server_side_encryption_by_default).kms_master_key_id
    ]) == aws_kms_key.state.arn
    error_message = "The state must be encrypted with its own key."
  }

  assert {
    condition     = aws_kms_key.state.enable_key_rotation && aws_kms_key.state.deletion_window_in_days == 30
    error_message = "The state key must rotate by itself, and a deletion must wait 30 days, so it can be cancelled."
  }

  assert {
    condition     = aws_s3_bucket.state.force_destroy == false
    error_message = "The state bucket must refuse to be deleted while it holds any state."
  }

  assert {
    condition = jsondecode(aws_s3_bucket_policy.state.policy).Statement[0].Condition == {
      Bool = { "aws:SecureTransport" = "false" }
    }
    error_message = "A request without TLS must be refused."
  }
}

run "the_budget_alarm_warns_before_the_month_passes_30_dollars" {
  assert {
    condition     = aws_budgets_budget.monthly.limit_amount == "30" && aws_budgets_budget.monthly.time_unit == "MONTHLY"
    error_message = "The budget is 30 dollars a month, as decision record 0001 of toolkit says."
  }

  assert {
    condition     = toset([for notification in aws_budgets_budget.monthly.notification : notification.notification_type]) == toset(["FORECASTED", "ACTUAL"])
    error_message = "The alarm must fire on the forecast, and again when the money is spent."
  }

  assert {
    condition     = alltrue([for notification in aws_budgets_budget.monthly.notification : notification.threshold == 100])
    error_message = "Both alarms fire at the whole budget."
  }
}

run "the_spending_check_reports_any_odd_spend_of_5_dollars_a_day" {
  assert {
    condition     = aws_ce_anomaly_subscription.daily.frequency == "DAILY"
    error_message = "Odd spending is reported once a day."
  }

  assert {
    condition = alltrue([
      for dimension in one(aws_ce_anomaly_subscription.daily.threshold_expression).dimension :
      dimension.key == "ANOMALY_TOTAL_IMPACT_ABSOLUTE" && toset(dimension.match_options) == toset(["GREATER_THAN_OR_EQUAL"]) && toset(dimension.values) == toset(["5"])
    ])
    error_message = "The spending check reports from 5 dollars of odd spend, not from AWS's default of 100."
  }
}
