locals {
  region = "eu-west-1"

  tags = {
    managed-by = "opentofu"
    repo       = "zigordev/platform"
    stack      = "email"
  }

  domain          = "zigordev.com"
  token_parameter = "/platform/CLOUDFLARE_API_TOKEN"

  dkim = {
    key_length = "RSA_2048_BIT"
    records    = 3
    zone       = "dkim.amazonses.com"
  }
}
