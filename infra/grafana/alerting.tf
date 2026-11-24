resource "grafana_contact_point" "email" {
  name = local.alerts.contact_point

  email {
    addresses = [data.aws_ssm_parameter.secret["ALERT_EMAIL"].value]
  }
}

resource "grafana_notification_policy" "main" {
  contact_point   = grafana_contact_point.email.name
  group_by        = local.alerts.group_by
  repeat_interval = local.alerts.repeat_interval
}
