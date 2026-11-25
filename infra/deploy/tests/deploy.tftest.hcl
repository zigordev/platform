mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }
}

run "the_shared_services_and_each_product_with_a_repo_deploy" {
  command = plan

  assert {
    condition     = toset(keys(aws_ssm_document.deploy)) == toset(["platform", "playground"])
    error_message = "The shared services deploy, and so does the playground, whose entry names its repo."
  }

  assert {
    condition     = toset(keys(aws_iam_role.deploy)) == toset(["platform", "playground"])
    error_message = "A role exists only for a target that deploys."
  }

  assert {
    condition     = nonsensitive(jsondecode(aws_iam_role.deploy["playground"].assume_role_policy)).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:zigordev@261390829/playground@1470249518:environment:production"
    error_message = "The playground's role trusts the environment production of its own repo."
  }
}

run "a_product_with_a_repo_gets_its_own_command_and_role" {
  command = plan

  variables {
    products_file = "tests/products.json"
  }

  assert {
    condition     = toset(keys(aws_ssm_document.deploy)) == toset(["platform", "shop"])
    error_message = "A product deploys once its entry names its repo, and a product without one does not."
  }

  assert {
    condition     = aws_ssm_document.deploy["shop"].name == "platform-deploy-shop"
    error_message = "The command is named after its target."
  }

  assert {
    condition     = aws_iam_role.deploy["shop"].name == "platform-deploy-shop"
    error_message = "The role is named after its target."
  }

  assert {
    condition     = jsondecode(aws_ssm_document.deploy["shop"].content).mainSteps[0].inputs.runCommand == ["/usr/local/sbin/platform-deploy --target shop --repo shop --dir . --action '{{ action }}' --commit '{{ commit }}' --images '{{ images }}'"]
    error_message = "A product's compose files sit at the top of its repo."
  }
}

run "the_command_runs_the_hosts_script_with_three_checked_parameters" {
  command = plan

  assert {
    condition     = jsondecode(aws_ssm_document.deploy["platform"].content).mainSteps[0].inputs.runCommand == ["/usr/local/sbin/platform-deploy --target platform --repo platform --dir stack --action '{{ action }}' --commit '{{ commit }}' --images '{{ images }}'"]
    error_message = "The command fixes the target, its repo and its folder, and passes on only the three parameters."
  }

  assert {
    condition     = aws_ssm_document.deploy["platform"].target_type == "/AWS::EC2::Instance"
    error_message = "The command runs on an instance only."
  }

  assert {
    condition     = toset(keys(jsondecode(aws_ssm_document.deploy["platform"].content).parameters)) == toset(["action", "commit", "images"])
    error_message = "The caller chooses the action, the commit and the images, and nothing else."
  }

  assert {
    condition     = jsondecode(aws_ssm_document.deploy["platform"].content).parameters.action.allowedValues == ["deploy", "rollback"]
    error_message = "The action is deploy or rollback."
  }

  assert {
    condition     = jsondecode(aws_ssm_document.deploy["platform"].content).parameters.commit.allowedPattern == "^[0-9a-f]{40}$"
    error_message = "The commit is a full SHA."
  }

  assert {
    condition = alltrue([
      can(regex(local.images_pattern, "")),
      can(regex(local.images_pattern, "ghcr.io/zigordev/shop-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")),
      can(regex(local.images_pattern, "ghcr.io/zigordev/shop-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa ghcr.io/zigordev/shop-web@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")),
    ])
    error_message = "The images are empty, or our images with their digests."
  }

  assert {
    condition = !anytrue([
      can(regex(local.images_pattern, "docker.io/someone/app@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")),
      can(regex(local.images_pattern, "ghcr.io/zigordev/shop-api:latest")),
      can(regex(local.images_pattern, "ghcr.io/zigordev/shop-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; reboot; '")),
    ])
    error_message = "Another registry, a tag without a digest and anything a shell could read as a command are refused."
  }
}

run "each_role_trusts_only_the_environment_production_of_its_own_repo" {
  command = plan

  variables {
    products_file = "tests/products.json"
  }

  assert {
    condition     = nonsensitive(jsondecode(aws_iam_role.deploy["shop"].assume_role_policy)).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:zigordev@261390829/shop@42:environment:production"
    error_message = "A product's role trusts GitHub's immutable subject for the environment production of its repo."
  }

  assert {
    condition     = nonsensitive(jsondecode(aws_iam_role.deploy["platform"].assume_role_policy)).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:zigordev@261390829/platform@1467993346:environment:production"
    error_message = "The shared services' role trusts the environment production of platform."
  }

  assert {
    condition     = nonsensitive(jsondecode(aws_iam_role.deploy["platform"].assume_role_policy)).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
    error_message = "The token is meant for AWS."
  }

  assert {
    condition     = nonsensitive(jsondecode(aws_iam_role.deploy["platform"].assume_role_policy)).Statement[0].Principal.Federated == "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    error_message = "GitHub's sign-in of the bootstrap vouches for the caller."
  }
}

run "each_role_sends_only_its_own_command_and_only_to_the_host" {
  command = plan

  assert {
    condition     = nonsensitive(jsondecode(aws_iam_role_policy.deploy["platform"].policy)).Statement[0].Resource == "arn:aws:ssm:eu-west-1:123456789012:document/platform-deploy-platform"
    error_message = "The role sends its own command, in this account, and no other."
  }

  assert {
    condition     = nonsensitive(jsondecode(aws_iam_role_policy.deploy["platform"].policy)).Statement[1].Condition.StringEquals["ssm:resourceTag/Name"] == "platform-host"
    error_message = "The command goes to the host only, found by its tag."
  }

  assert {
    condition     = toset(flatten([for statement in nonsensitive(jsondecode(aws_iam_role_policy.deploy["platform"].policy)).Statement : statement.Action])) == toset(["ssm:SendCommand", "ssm:GetCommandInvocation", "ssm:ListCommandInvocations"])
    error_message = "The role sends the command and reads its result, and can do nothing else."
  }
}

run "the_host_reads_only_what_each_target_names_and_keeps_the_records" {
  command = plan

  variables {
    products_file = "tests/products.json"
  }

  assert {
    condition = sort(nonsensitive(jsondecode(aws_iam_role_policy.host.policy)).Statement[0].Resource) == sort([
      "arn:aws:ssm:eu-west-1:123456789012:parameter/platform/CLOUDFLARE_TUNNEL_TOKEN",
      "arn:aws:ssm:eu-west-1:123456789012:parameter/platform/GRAFANA_ALLOY_TOKEN",
      "arn:aws:ssm:eu-west-1:123456789012:parameter/platform/GRAFANA_LOKI_URL",
      "arn:aws:ssm:eu-west-1:123456789012:parameter/platform/GRAFANA_LOKI_USER",
      "arn:aws:ssm:eu-west-1:123456789012:parameter/platform/GRAFANA_OTLP_URL",
      "arn:aws:ssm:eu-west-1:123456789012:parameter/platform/GRAFANA_STACK_ID",
      "arn:aws:ssm:eu-west-1:123456789012:parameter/platform/KAFKA_ADMIN_PASSWORD",
      "arn:aws:ssm:eu-west-1:123456789012:parameter/platform/KAFKA_SETUP_PASSWORD",
      "arn:aws:ssm:eu-west-1:123456789012:parameter/shop/*",
    ])
    error_message = "The host reads the shared services' secrets by name, never all of /platform, and each product's own path."
  }

  assert {
    condition     = nonsensitive(jsondecode(aws_iam_role_policy.host.policy)).Statement[1].Resource == "arn:aws:ssm:eu-west-1:123456789012:parameter/platform/deploy/*"
    error_message = "The host writes the records under /platform/deploy only."
  }

  assert {
    condition     = nonsensitive(jsondecode(aws_iam_role_policy.host.policy)).Statement[1].Action == ["ssm:GetParameter", "ssm:PutParameter"]
    error_message = "The host reads and writes the records."
  }

  assert {
    condition     = nonsensitive(jsondecode(aws_iam_role_policy.host.policy)).Statement[2].Resource == "arn:aws:ssm:eu-west-1:123456789012:parameter/platform/deploy"
    error_message = "The host lists the records to bring them back on a new host."
  }

  assert {
    condition     = aws_iam_role_policy.host.role == "platform-host"
    error_message = "The policy belongs to the host's role."
  }
}

run "the_account_number_stays_out_of_the_plan" {
  command = plan

  assert {
    condition = alltrue([
      issensitive(aws_iam_role.deploy["platform"].assume_role_policy),
      issensitive(aws_iam_role_policy.deploy["platform"].policy),
      issensitive(aws_iam_role_policy.host.policy),
    ])
    error_message = "Every document that holds the account number is marked sensitive, so the public plan never prints it."
  }
}
