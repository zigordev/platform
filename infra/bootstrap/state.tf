terraform {
  backend "s3" {
    bucket       = "platform-state-512539654280"
    key          = "bootstrap/terraform.tfstate"
    region       = "eu-west-1"
    use_lockfile = true
    encrypt      = true
  }

  encryption {
    key_provider "aws_kms" "state" {
      kms_key_id = "alias/platform-state"
      region     = "eu-west-1"
      key_spec   = "AES_256"
    }

    method "aes_gcm" "state" {
      keys = key_provider.aws_kms.state
    }

    state {
      method   = method.aes_gcm.state
      enforced = true
    }

    plan {
      method   = method.aes_gcm.state
      enforced = true
    }
  }
}
