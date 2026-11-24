data "aws_ssm_parameter" "cloud_token" {
  name = local.token_parameter
}

data "grafana_cloud_stack" "main" {
  slug = local.stack_slug
}

resource "grafana_cloud_access_policy" "platform" {
  for_each = local.policies

  region       = data.grafana_cloud_stack.main.region_slug
  name         = each.value.name
  display_name = each.value.description
  scopes       = each.value.scopes

  realm {
    type       = "stack"
    identifier = local.stack_id
  }
}

resource "grafana_cloud_access_policy_token" "platform" {
  for_each = local.policies

  region           = data.grafana_cloud_stack.main.region_slug
  access_policy_id = grafana_cloud_access_policy.platform[each.key].policy_id
  name             = "${each.value.name}-${local.rotation}"
}

resource "grafana_cloud_stack_service_account" "opentofu" {
  stack_slug = data.grafana_cloud_stack.main.slug
  name       = local.service_account.name
  role       = local.service_account.role
}

resource "grafana_cloud_stack_service_account_token" "opentofu" {
  stack_slug         = data.grafana_cloud_stack.main.slug
  service_account_id = grafana_cloud_stack_service_account.opentofu.id
  name               = "${local.service_account.name}-${local.rotation}"
}

resource "grafana_synthetic_monitoring_installation" "main" {
  stack_id              = local.stack_id
  metrics_publisher_key = grafana_cloud_access_policy_token.platform["checks"].token
}
