variable "products_file" {
  description = "The list of products. Only the tests point it elsewhere"
  type        = string
  default     = null
}

data "aws_caller_identity" "current" {}

locals {
  region = "eu-west-1"

  tags = {
    managed-by = "opentofu"
    repo       = "zigordev/platform"
    stack      = "deploy"
  }

  github = {
    owner       = "zigordev"
    owner_id    = 261390829
    environment = "production"
  }

  host_role = "platform-host"
  host_tag  = "platform-host"
  records   = "/platform/deploy"
  script    = "/usr/local/sbin/platform-deploy"

  account_id = sensitive(data.aws_caller_identity.current.account_id)

  products = jsondecode(file(coalesce(var.products_file, "${path.module}/../products.json")))

  shared_secrets = [
    for line in split("\n", file("${path.module}/../../stack/.env.production.example")) :
    split("=", line)[0] if length(regexall("^[A-Z][A-Z0-9_]*=", line)) > 0
  ]

  targets = merge(
    {
      platform = {
        repo       = "platform"
        repo_id    = 1467993346
        dir        = "stack"
        parameters = [for name in local.shared_secrets : "platform/${name}"]
      }
    },
    {
      for name, product in local.products : name => {
        repo       = product.deploy.repo
        repo_id    = product.deploy.repoId
        dir        = "."
        parameters = ["${name}/*"]
      } if can(product.deploy)
    },
  )

  images_pattern = "^(ghcr\\.io/zigordev/[a-z0-9][a-z0-9-]*@sha256:[0-9a-f]{64}( ghcr\\.io/zigordev/[a-z0-9][a-z0-9-]*@sha256:[0-9a-f]{64})*)?$"
}
