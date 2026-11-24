locals {
  data_sources = {
    prometheus = {
      type = "prometheus"
      url  = "${data.aws_ssm_parameter.address["GRAFANA_PROMETHEUS_URL"].insecure_value}/api/prom"
      user = data.aws_ssm_parameter.secret["GRAFANA_PROMETHEUS_USER"].value
      json = { httpMethod = "POST" }
    }
    loki = {
      type = "loki"
      url  = data.aws_ssm_parameter.address["GRAFANA_LOKI_URL"].insecure_value
      user = data.aws_ssm_parameter.secret["GRAFANA_LOKI_USER"].value
      json = {}
    }
    tempo = {
      type = "tempo"
      url  = "${data.aws_ssm_parameter.address["GRAFANA_TEMPO_URL"].insecure_value}/tempo"
      user = data.aws_ssm_parameter.secret["GRAFANA_TEMPO_USER"].value
      json = {}
    }
  }
}

resource "grafana_data_source" "telemetry" {
  for_each = local.data_sources

  name                = each.key
  uid                 = each.key
  type                = each.value.type
  url                 = each.value.url
  basic_auth_enabled  = true
  basic_auth_username = each.value.user
  json_data_encoded   = jsonencode(each.value.json)

  secure_json_data_encoded = jsonencode({
    basicAuthPassword = data.aws_ssm_parameter.secret["GRAFANA_READ_TOKEN"].value
  })
}
