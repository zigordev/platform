locals {
  region = "eu-west-1"

  tags = {
    managed-by = "opentofu"
    repo       = "zigordev/platform"
    stack      = "github"
  }

  owner = "zigordev"

  app = {
    id              = 5889897
    installation_id = 185052691
    key_parameter   = "/platform/GITHUB_APP_PRIVATE_KEY"
  }

  repos = {
    toolkit = {
      description = "The shared base of every zigordev repository: packages, the product template, pipelines, rules and the handbook"
      deploys     = false
    }
    platform = {
      description = "The infrastructure and the shared services of every zigordev product: the ingress, telemetry, dashboards, alerts, backups and runbooks"
      deploys     = true
    }
    playground = {
      description = "The test app of step 3.9: the whole product template, deployed from every merge to main"
      deploys     = true
    }
  }

  required_check = {
    context        = "check"
    integration_id = 15368
  }

  release = {
    environment = "release"
    branch      = "main"
  }

  production = {
    environment = "production"
    branch      = "main"
  }

  destructive_migration = {
    name        = "destructive-migration"
    color       = "b60205"
    description = "A migration that deletes data. Only the owner adds this label, to let it through"
  }
}
