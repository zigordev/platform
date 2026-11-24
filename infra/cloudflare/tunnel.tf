resource "cloudflare_zero_trust_tunnel_cloudflared" "host" {
  account_id = data.cloudflare_zone.main.account.id
  name       = local.tunnel.name
  config_src = "cloudflare"
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "host" {
  account_id = data.cloudflare_zone.main.account.id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.host.id

  config = {
    ingress = [
      {
        hostname = "*.${local.domain}"
        service  = local.tunnel.origin
      },
      {
        service = "http_status:404"
      },
    ]
  }
}
