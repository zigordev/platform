locals {
  secrets = {
    GRAFANA_STACK_TOKEN  = "The stack account platform-opentofu: the grafana stack and the pipeline's push sign in with it"
    GRAFANA_ALLOY_TOKEN  = "The telemetry agent on the host writes metrics, logs and traces with it"
    GRAFANA_READ_TOKEN   = "The data sources prometheus, loki and tempo read with it"
    GRAFANA_CHECKS_TOKEN = "The grafana stack manages the outside checks with it"
  }

  secret_values = {
    GRAFANA_STACK_TOKEN  = grafana_cloud_stack_service_account_token.opentofu.key
    GRAFANA_ALLOY_TOKEN  = grafana_cloud_access_policy_token.platform["alloy"].token
    GRAFANA_READ_TOKEN   = grafana_cloud_access_policy_token.platform["read"].token
    GRAFANA_CHECKS_TOKEN = grafana_synthetic_monitoring_installation.main.sm_access_token
  }

  addresses = {
    GRAFANA_URL             = data.grafana_cloud_stack.main.url
    GRAFANA_STACK_ID        = local.stack_id
    GRAFANA_OTLP_URL        = data.grafana_cloud_stack.main.otlp_url
    GRAFANA_LOKI_URL        = data.grafana_cloud_stack.main.logs_url
    GRAFANA_LOKI_USER       = tostring(data.grafana_cloud_stack.main.logs_user_id)
    GRAFANA_PROMETHEUS_URL  = data.grafana_cloud_stack.main.prometheus_url
    GRAFANA_PROMETHEUS_USER = tostring(data.grafana_cloud_stack.main.prometheus_user_id)
    GRAFANA_TEMPO_URL       = data.grafana_cloud_stack.main.traces_url
    GRAFANA_TEMPO_USER      = tostring(data.grafana_cloud_stack.main.traces_user_id)
    GRAFANA_CHECKS_URL      = grafana_synthetic_monitoring_installation.main.stack_sm_api_url
  }
}

resource "aws_ssm_parameter" "secret" {
  for_each = local.secrets

  name        = "/platform/${each.key}"
  description = each.value
  type        = "SecureString"
  value       = local.secret_values[each.key]
}

resource "aws_ssm_parameter" "address" {
  for_each = local.addresses

  name        = "/platform/${each.key}"
  description = "Grafana Cloud's address or id for this stack. Not a secret"
  type        = "String"
  value       = each.value
}
