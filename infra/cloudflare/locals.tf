locals {
  region = "eu-west-1"

  tags = {
    managed-by = "opentofu"
    repo       = "zigordev/platform"
    stack      = "cloudflare"
  }

  domain          = "zigordev.com"
  token_parameter = "/platform/CLOUDFLARE_API_TOKEN"

  products = {
    hello = {
      description = "The test page that step 3.9 deploys"
    }
  }

  tunnel = {
    name   = "platform-host"
    origin = "http://traefik:8080"
  }

  mail = {
    spf   = "v=spf1 -all"
    dmarc = "v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s"
  }

  zone_settings = {
    always_use_https         = "on"
    automatic_https_rewrites = "on"
    min_tls_version          = "1.2"
  }
}
