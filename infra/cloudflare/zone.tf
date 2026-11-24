data "aws_ssm_parameter" "cloudflare_token" {
  name = local.token_parameter
}

data "cloudflare_zone" "main" {
  filter = {
    name = local.domain
  }
}

resource "cloudflare_zone_setting" "https" {
  for_each = local.zone_settings

  zone_id    = data.cloudflare_zone.main.id
  setting_id = each.key
  value      = each.value
}
