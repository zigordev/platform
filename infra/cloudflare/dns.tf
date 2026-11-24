resource "cloudflare_dns_record" "product" {
  for_each = local.products

  zone_id = data.cloudflare_zone.main.id
  name    = "${each.key}.${local.domain}"
  type    = "CNAME"
  content = "${cloudflare_zero_trust_tunnel_cloudflared.host.id}.cfargotunnel.com"
  proxied = true
  ttl     = 1
  comment = each.value.description
}

resource "cloudflare_dns_record" "spf" {
  zone_id = data.cloudflare_zone.main.id
  name    = local.domain
  type    = "TXT"
  content = "\"${local.mail.spf}\""
  ttl     = 1
  comment = "No server may send mail as this domain until SES does"
}

resource "cloudflare_dns_record" "dmarc" {
  zone_id = data.cloudflare_zone.main.id
  name    = "_dmarc.${local.domain}"
  type    = "TXT"
  content = "\"${local.mail.dmarc}\""
  ttl     = 1
  comment = "Receivers reject any mail that claims this domain and fails SPF or DKIM"
}
