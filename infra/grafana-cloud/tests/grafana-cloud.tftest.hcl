mock_provider "aws" {
  mock_data "aws_ssm_parameter" {
    defaults = {
      value = "not-a-real-token"
    }
  }
}

mock_provider "grafana" {
  mock_data "grafana_cloud_stack" {
    defaults = {
      id                 = "123456"
      region_slug        = "prod-eu-west-6"
      url                = "https://stand-in.grafana.net"
      otlp_url           = "https://otlp.stand-in.example"
      logs_url           = "https://logs.stand-in.example"
      logs_user_id       = 1
      prometheus_url     = "https://prometheus.stand-in.example"
      prometheus_user_id = 2
      traces_url         = "https://traces.stand-in.example"
      traces_user_id     = 3
    }
  }

  mock_resource "grafana_synthetic_monitoring_installation" {
    defaults = {
      stack_sm_api_url = "https://checks.stand-in.example"
    }
  }
}

run "the_agent_may_only_write_telemetry" {
  command = plan

  assert {
    condition     = grafana_cloud_access_policy.platform["alloy"].scopes == toset(["metrics:write", "logs:write", "traces:write"])
    error_message = "The agent's token writes metrics, logs and traces, and reads nothing."
  }
}

run "the_data_sources_may_only_read" {
  command = plan

  assert {
    condition     = grafana_cloud_access_policy.platform["read"].scopes == toset(["metrics:read", "logs:read", "traces:read"])
    error_message = "The data sources' token reads, and writes nothing."
  }
}

run "the_checks_get_exactly_what_grafana_asks_for" {
  command = plan

  assert {
    condition     = grafana_cloud_access_policy.platform["checks"].scopes == toset(["stacks:read", "metrics:write", "logs:write", "traces:write"])
    error_message = "The outside checks get the four scopes their installation needs, and no more."
  }
}

run "every_policy_covers_this_stack_only" {
  command = plan

  assert {
    condition = alltrue([
      for policy in grafana_cloud_access_policy.platform :
      length(policy.realm) == 1 && policy.realm[0].type == "stack" && policy.realm[0].identifier == "123456"
    ])
    error_message = "Every token works for this stack only, never for the whole organisation."
  }

  assert {
    condition     = alltrue([for policy in grafana_cloud_access_policy.platform : policy.region == "prod-eu-west-6"])
    error_message = "The policies live in the stack's own region, Ireland."
  }
}

run "the_stack_account_administers_this_stack_only" {
  command = plan

  assert {
    condition     = grafana_cloud_stack_service_account.opentofu.role == "Admin" && grafana_cloud_stack_service_account.opentofu.stack_slug == "merryantelope975"
    error_message = "The code's stack account may manage data sources, alerts and dashboards in this stack."
  }
}

run "the_tokens_land_in_parameter_store_as_secure_strings" {
  command = plan

  assert {
    condition = alltrue([
      for name, parameter in aws_ssm_parameter.secret :
      parameter.type == "SecureString" && parameter.name == "/platform/${name}"
    ])
    error_message = "Every token is a SecureString under /platform."
  }

  assert {
    condition     = toset(keys(aws_ssm_parameter.secret)) == toset(["GRAFANA_STACK_TOKEN", "GRAFANA_ALLOY_TOKEN", "GRAFANA_READ_TOKEN", "GRAFANA_CHECKS_TOKEN"])
    error_message = "The four tokens are stored, and nothing else as a secret."
  }

  assert {
    condition     = alltrue([for parameter in aws_ssm_parameter.address : parameter.type == "String"])
    error_message = "The addresses and ids are plain strings, so reading them needs no key."
  }
}

run "raising_the_rotation_names_every_token_anew" {
  command = plan

  assert {
    condition = alltrue([
      for key, token in grafana_cloud_access_policy_token.platform :
      token.name == "${local.policies[key].name}-${local.rotation}"
    ]) && grafana_cloud_stack_service_account_token.opentofu.name == "platform-opentofu-${local.rotation}"
    error_message = "Each token's name carries the rotation, so raising it replaces every token."
  }
}
