mock_provider "aws" {
  mock_data "aws_ssm_parameter" {
    defaults = {
      value          = "stand-in value"
      insecure_value = "https://stand-in.example"
    }
  }

  override_data {
    target = data.aws_ssm_parameter.secret["GRAFANA_READ_TOKEN"]
    values = {
      value = "stand-in read token"
    }
  }

  override_data {
    target = data.aws_ssm_parameter.secret["ALERT_EMAIL"]
    values = {
      value = "owner@example.com"
    }
  }

  override_data {
    target = data.aws_ssm_parameter.address["GRAFANA_PROMETHEUS_URL"]
    values = {
      insecure_value = "https://prometheus.stand-in.example"
    }
  }

  override_data {
    target = data.aws_ssm_parameter.address["GRAFANA_TEMPO_URL"]
    values = {
      insecure_value = "https://tempo.stand-in.example"
    }
  }
}

mock_provider "grafana" {
  mock_data "grafana_synthetic_monitoring_probes" {
    defaults = {
      probes = {
        Frankfurt = 1
        London    = 2
        Paris     = 3
      }
    }
  }
}

run "the_data_sources_carry_the_laptops_names" {
  command = plan

  assert {
    condition     = toset(keys(grafana_data_source.telemetry)) == toset(["prometheus", "loki", "tempo"])
    error_message = "The stack has the three data sources the laptop has."
  }

  assert {
    condition     = alltrue([for name, source in grafana_data_source.telemetry : source.uid == name && source.name == name])
    error_message = "Each data source's uid and name are the ones the dashboards and alerts name."
  }

  assert {
    condition = (
      grafana_data_source.telemetry["prometheus"].url == "https://prometheus.stand-in.example/api/prom" &&
      grafana_data_source.telemetry["tempo"].url == "https://tempo.stand-in.example/tempo"
    )
    error_message = "Prometheus answers under /api/prom, and Tempo under /tempo."
  }
}

run "the_data_sources_sign_in_with_the_read_token" {
  command = plan

  assert {
    condition = alltrue([
      for source in grafana_data_source.telemetry :
      source.basic_auth_enabled && jsondecode(source.secure_json_data_encoded).basicAuthPassword == "stand-in read token"
    ])
    error_message = "Every data source signs in with the token that only reads."
  }
}

run "alerts_go_to_the_owners_address_by_email" {
  command = plan

  assert {
    condition     = one(grafana_contact_point.email.email).addresses == tolist(["owner@example.com"])
    error_message = "The contact point mails the address the owner keeps in Parameter Store."
  }

  assert {
    condition     = grafana_notification_policy.main.contact_point == "email"
    error_message = "Every alert goes to that contact point."
  }
}

run "no_check_runs_while_no_product_is_live" {
  command = plan

  assert {
    condition     = length(grafana_synthetic_monitoring_check.health) == 0
    error_message = "A product that is not live has no outside check yet, so it raises no false alarm."
  }
}

run "a_live_product_is_checked_every_5_minutes_from_two_places" {
  command = plan

  variables {
    products_file = "tests/live-products.json"
  }

  assert {
    condition     = toset(keys(grafana_synthetic_monitoring_check.health)) == toset(["playground"])
    error_message = "Only the live product is checked."
  }

  assert {
    condition = (
      grafana_synthetic_monitoring_check.health["playground"].target == "https://playground.zigordev.com/health" &&
      grafana_synthetic_monitoring_check.health["playground"].frequency == 300000 &&
      grafana_synthetic_monitoring_check.health["playground"].probes == toset([1, 2])
    )
    error_message = "The check calls /health over https every 5 minutes, from Frankfurt and London."
  }

  assert {
    condition     = one(one(grafana_synthetic_monitoring_check.health["playground"].settings).http).fail_if_not_ssl
    error_message = "A product that answers without TLS fails its check."
  }
}
