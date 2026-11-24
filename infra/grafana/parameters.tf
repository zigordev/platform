data "aws_ssm_parameter" "secret" {
  for_each = toset([
    "GRAFANA_STACK_TOKEN",
    "GRAFANA_READ_TOKEN",
    "GRAFANA_CHECKS_TOKEN",
    "GRAFANA_PROMETHEUS_USER",
    "GRAFANA_LOKI_USER",
    "GRAFANA_TEMPO_USER",
    "ALERT_EMAIL",
  ])

  name = "/platform/${each.key}"
}

data "aws_ssm_parameter" "address" {
  for_each = toset([
    "GRAFANA_URL",
    "GRAFANA_PROMETHEUS_URL",
    "GRAFANA_LOKI_URL",
    "GRAFANA_TEMPO_URL",
    "GRAFANA_CHECKS_URL",
  ])

  name = "/platform/${each.key}"
}
