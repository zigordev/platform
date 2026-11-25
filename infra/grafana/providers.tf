terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.74.0"
    }
    grafana = {
      source  = "grafana/grafana"
      version = "4.55.0"
    }
  }

  backend "s3" {
    bucket       = "zigordev-platform-opentofu-state"
    key          = "grafana/terraform.tfstate"
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
  url             = data.aws_ssm_parameter.address["GRAFANA_URL"].insecure_value
  auth            = data.aws_ssm_parameter.secret["GRAFANA_STACK_TOKEN"].value
  sm_url          = data.aws_ssm_parameter.address["GRAFANA_CHECKS_URL"].insecure_value
  sm_access_token = data.aws_ssm_parameter.secret["GRAFANA_CHECKS_TOKEN"].value
}
