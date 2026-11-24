data "grafana_synthetic_monitoring_probes" "all" {}

resource "grafana_synthetic_monitoring_check" "health" {
  for_each = local.live_products

  job       = each.key
  target    = "https://${each.key}.${local.domain}/health"
  enabled   = true
  frequency = local.checks.every_ms
  timeout   = local.checks.timeout_ms
  probes    = [for name in local.checks.probes : data.grafana_synthetic_monitoring_probes.all.probes[name]]

  labels = {
    product = each.key
  }

  settings {
    http {
      method          = "GET"
      fail_if_not_ssl = true
    }
  }
}
