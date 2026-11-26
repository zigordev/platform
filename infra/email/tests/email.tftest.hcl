mock_provider "aws" {
  mock_data "aws_ssm_parameter" {
    defaults = {
      value = "not-a-real-token"
    }
  }

  mock_resource "aws_sesv2_email_identity" {
    defaults = {
      arn = "arn:aws:ses:eu-west-1:000000000000:identity/zigordev.com"
      dkim_signing_attributes = {
        tokens = ["firsttoken", "secondtoken", "thirdtoken"]
      }
    }
  }

  mock_resource "aws_iam_access_key" {
    defaults = {
      id                   = "not-a-real-key-id"
      ses_smtp_password_v4 = "not a real password"
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
    error_message = "The identity lives in eu-west-1, where the notifications service sends through SES's SMTP endpoint, and where the provider can make an SMTP password."
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

run "the_mail_user_may_only_send_raw_email_as_the_domain" {
  command = plan

  assert {
    condition     = aws_iam_user.smtp.name == "notifications-smtp"
    error_message = "The mail password belongs to one IAM user, named after the service that signs in with it."
  }

  assert {
    condition = jsondecode(aws_iam_user_policy.smtp.policy).Statement == [
      {
        Effect   = "Allow"
        Action   = "ses:SendRawEmail"
        Resource = "arn:aws:ses:eu-west-1:000000000000:identity/zigordev.com"
      },
    ]
    error_message = "The user may do one thing: ses:SendRawEmail, the action behind SES's SMTP endpoint, as the identity zigordev.com."
  }

  assert {
    condition     = aws_iam_access_key.smtp.user == "notifications-smtp"
    error_message = "The code makes the user's one key, so nobody makes it by hand."
  }

  assert {
    condition     = terraform_data.smtp_rotation.input == 1
    error_message = "The key is in its first generation. Raising local.smtp.rotation replaces it."
  }
}

run "the_service_finds_its_smtp_user_and_password_in_its_own_parameters" {
  command = plan

  assert {
    condition = { for name, parameter in aws_ssm_parameter.smtp : name => parameter.name } == {
      NOTIFICATIONS_API_SMTP_USER     = "/notifications/NOTIFICATIONS_API_SMTP_USER"
      NOTIFICATIONS_API_SMTP_PASSWORD = "/notifications/NOTIFICATIONS_API_SMTP_PASSWORD"
    }
    error_message = "The two values sit under /notifications/, with the names that notifications' .env.production.example gives."
  }

  assert {
    condition     = alltrue([for parameter in aws_ssm_parameter.smtp : parameter.type == "SecureString"])
    error_message = "Both values are SecureStrings, so Parameter Store keeps them encrypted."
  }

  assert {
    condition = (
      nonsensitive(aws_ssm_parameter.smtp["NOTIFICATIONS_API_SMTP_USER"].value) == "not-a-real-key-id" &&
      nonsensitive(aws_ssm_parameter.smtp["NOTIFICATIONS_API_SMTP_PASSWORD"].value) == "not a real password"
    )
    error_message = "The user is the key's id, and the password is the SMTP password the provider makes from the key's secret."
  }
}

run "the_code_signs_in_to_cloudflare_with_the_token_the_owner_stores" {
  command = plan

  assert {
    condition     = data.aws_ssm_parameter.cloudflare_token.name == "/platform/CLOUDFLARE_API_TOKEN"
    error_message = "The provider takes its token from Parameter Store, where only the owner stores it."
  }
}
