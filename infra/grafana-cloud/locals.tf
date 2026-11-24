locals {
  region = "eu-west-1"

  tags = {
    managed-by = "opentofu"
    repo       = "zigordev/platform"
    stack      = "grafana-cloud"
  }

  stack_slug      = "merryantelope975"
  stack_id        = sensitive(data.grafana_cloud_stack.main.id)
  token_parameter = "/platform/GRAFANA_CLOUD_TOKEN"
  rotation        = 1

  policies = {
    alloy = {
      name        = "platform-alloy"
      description = "The telemetry agent on the host writes metrics, logs and traces"
      scopes      = ["metrics:write", "logs:write", "traces:write"]
    }
    read = {
      name        = "platform-read"
      description = "The data sources prometheus, loki and tempo read what the agent wrote"
      scopes      = ["metrics:read", "logs:read", "traces:read"]
    }
    checks = {
      name        = "platform-checks"
      description = "The outside checks publish their results"
      scopes      = ["stacks:read", "metrics:write", "logs:write", "traces:write"]
    }
  }

  service_account = {
    name = "platform-opentofu"
    role = "Admin"
  }
}
