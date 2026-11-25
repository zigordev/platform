terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.74.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.29.0"
    }
  }

  backend "s3" {
    bucket       = "zigordev-platform-opentofu-state"
    key          = "cloudflare/terraform.tfstate"
    region       = "eu-west-1"
    encrypt      = true
    kms_key_id   = "alias/platform-opentofu-state"
    use_lockfile = true
  }
}

provider "aws" {
  region = local.region

  default_tags {
    tags = local.tags
  }
}

provider "cloudflare" {
  api_token = data.aws_ssm_parameter.cloudflare_token.value
}
