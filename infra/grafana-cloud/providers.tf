terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.73.0"
    }
    grafana = {
      source  = "grafana/grafana"
      version = "4.55.0"
    }
  }

  backend "s3" {
    bucket       = "zigordev-platform-opentofu-state"
    key          = "grafana-cloud/terraform.tfstate"
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

provider "grafana" {
  cloud_access_policy_token = data.aws_ssm_parameter.cloud_token.value
}
