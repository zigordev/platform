data "aws_ssm_parameter" "cloudflare_token" {
  name = local.token_parameter
}

data "cloudflare_zone" "main" {
  filter = {
    name = local.domain
  }
}

resource "cloudflare_dns_record" "dkim" {
  count = local.dkim.records

  zone_id = data.cloudflare_zone.main.id
  name    = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${local.domain}"
  type    = "CNAME"
  content = "${aws_sesv2_email_identity.domain.dkim_signing_attributes[0].tokens[count.index]}.${local.dkim.zone}"
  proxied = false
  ttl     = 1
  comment = "SES signs the domain's mail with the key behind this name"
}
