mock_provider "aws" {
  mock_data "aws_ssm_parameter" {
    defaults = {
      value = "not-a-real-token"
    }
  }

  mock_resource "aws_sesv2_email_identity" {
    defaults = {
      dkim_signing_attributes = {
        tokens = ["firsttoken", "secondtoken", "thirdtoken"]
      }
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
}

run "the_domain_is_an_ses_identity_that_ses_signs_with_its_own_2048_bit_key" {
  command = plan

  assert {
    condition     = aws_sesv2_email_identity.domain.email_identity == "zigordev.com"
    error_message = "The identity is the domain itself, so every address at zigordev.com may send once it is verified."
  }

  assert {
    condition     = aws_sesv2_email_identity.domain.dkim_signing_attributes[0].next_signing_key_length == "RSA_2048_BIT"
    error_message = "SES signs with a 2048-bit key, the length AWS prefers."
  }

  assert {
    condition = (
      aws_sesv2_email_identity.domain.dkim_signing_attributes[0].domain_signing_private_key == null &&
      aws_sesv2_email_identity.domain.dkim_signing_attributes[0].domain_signing_selector == null
    )
    error_message = "SES makes and holds the key, Easy DKIM, so no private key reaches the code or the state."
  }

  assert {
    condition     = local.region == "eu-west-1"
    error_message = "The identity lives in eu-west-1, where the notifications service sends through SES's SMTP endpoint."
  }
}

run "every_dkim_key_gets_a_dns_only_cname_named_after_its_token" {
  command = plan

  assert {
    condition     = length(cloudflare_dns_record.dkim) == 3
    error_message = "Easy DKIM needs exactly three records."
  }

  assert {
    condition = [for record in cloudflare_dns_record.dkim : record.name] == [
      "firsttoken._domainkey.zigordev.com",
      "secondtoken._domainkey.zigordev.com",
      "thirdtoken._domainkey.zigordev.com",
    ]
    error_message = "Each record is named <token>._domainkey.zigordev.com, one per token that SES gives."
  }

  assert {
    condition = [for record in cloudflare_dns_record.dkim : record.content] == [
      "firsttoken.dkim.amazonses.com",
      "secondtoken.dkim.amazonses.com",
      "thirdtoken.dkim.amazonses.com",
    ]
    error_message = "Each record points at <token>.dkim.amazonses.com, the zone that AWS's table names for eu-west-1."
  }

  assert {
    condition = alltrue([
      for record in cloudflare_dns_record.dkim :
      record.type == "CNAME" && !record.proxied
    ])
    error_message = "The records are CNAMEs that Cloudflare answers as they are, never proxied, so receivers reach SES's keys."
  }
}

run "the_code_signs_in_to_cloudflare_with_the_token_the_owner_stores" {
  command = plan

  assert {
    condition     = data.aws_ssm_parameter.cloudflare_token.name == "/platform/CLOUDFLARE_API_TOKEN"
    error_message = "The provider takes its token from Parameter Store, where only the owner stores it."
  }
}
