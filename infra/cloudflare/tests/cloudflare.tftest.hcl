mock_provider "aws" {
  mock_data "aws_ssm_parameter" {
    defaults = {
      value = "not-a-real-token"
    }
  }
}

mock_provider "cloudflare" {
  mock_data "cloudflare_zone" {
    defaults = {
      id = "0123456789abcdef0123456789abcdef"
      account = {
        id   = "fedcba9876543210fedcba9876543210"
        name = "a stand-in account"
      }
    }
  }

  mock_resource "cloudflare_zero_trust_tunnel_cloudflared" {
    defaults = {
      id = "11111111-2222-3333-4444-555555555555"
    }
  }
}

run "every_product_gets_a_proxied_record_that_points_at_the_tunnel" {
  command = plan

  assert {
    condition     = length(cloudflare_dns_record.product) == length(local.products)
    error_message = "Every product in the list gets exactly one record."
  }

  assert {
    condition = alltrue([
      for key, record in cloudflare_dns_record.product :
      record.name == "${key}.zigordev.com" && record.type == "CNAME" && record.proxied
    ])
    error_message = "A product's record is <product>.zigordev.com, a proxied CNAME, so Cloudflare serves it with its certificate."
  }

  assert {
    condition = alltrue([
      for record in cloudflare_dns_record.product :
      record.content == "11111111-2222-3333-4444-555555555555.cfargotunnel.com"
    ])
    error_message = "Every product's record points at the tunnel, the only way to the host."
  }
}

run "the_tunnel_sends_every_product_name_to_traefik_and_nothing_else" {
  command = plan

  assert {
    condition     = cloudflare_zero_trust_tunnel_cloudflared.host.config_src == "cloudflare"
    error_message = "Cloudflare holds the tunnel's configuration, so the host holds only its token."
  }

  assert {
    condition = (
      length(cloudflare_zero_trust_tunnel_cloudflared_config.host.config.ingress) == 2 &&
      cloudflare_zero_trust_tunnel_cloudflared_config.host.config.ingress[0].hostname == "*.zigordev.com" &&
      cloudflare_zero_trust_tunnel_cloudflared_config.host.config.ingress[0].service == "http://traefik:8080"
    )
    error_message = "Every name under the domain goes to Traefik's web entrypoint, which routes it by its labels."
  }

  assert {
    condition = (
      cloudflare_zero_trust_tunnel_cloudflared_config.host.config.ingress[1].service == "http_status:404" &&
      cloudflare_zero_trust_tunnel_cloudflared_config.host.config.ingress[1].hostname == null
    )
    error_message = "Anything else that reaches the tunnel gets a 404."
  }
}

run "no_server_may_send_mail_as_the_domain" {
  command = plan

  assert {
    condition     = cloudflare_dns_record.spf.name == "zigordev.com" && cloudflare_dns_record.spf.type == "TXT" && cloudflare_dns_record.spf.content == "\"v=spf1 -all\""
    error_message = "SPF names no sender at all."
  }

  assert {
    condition = (
      cloudflare_dns_record.dmarc.name == "_dmarc.zigordev.com" &&
      strcontains(cloudflare_dns_record.dmarc.content, "p=reject") &&
      strcontains(cloudflare_dns_record.dmarc.content, "sp=reject")
    )
    error_message = "DMARC tells receivers to reject mail that claims the domain or any subdomain and fails its checks."
  }
}

run "visitors_get_https_only" {
  command = plan

  assert {
    condition     = cloudflare_zone_setting.https["always_use_https"].value == "on" && cloudflare_zone_setting.https["automatic_https_rewrites"].value == "on"
    error_message = "Cloudflare sends every http:// visitor to https://, and rewrites http:// links in pages."
  }

  assert {
    condition     = cloudflare_zone_setting.https["min_tls_version"].value == "1.2"
    error_message = "Cloudflare refuses TLS older than 1.2."
  }
}

run "the_code_signs_in_with_the_token_the_owner_stores" {
  command = plan

  assert {
    condition     = data.aws_ssm_parameter.cloudflare_token.name == "/platform/CLOUDFLARE_API_TOKEN"
    error_message = "The provider takes its token from Parameter Store, where only the owner stores it."
  }
}
