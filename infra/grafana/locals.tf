variable "products_file" {
  description = "The list of products. Only the tests point it elsewhere"
  type        = string
  default     = null
}

locals {
  region = "eu-west-1"

  tags = {
    managed-by = "opentofu"
    repo       = "zigordev/platform"
    stack      = "grafana"
  }

  domain        = "zigordev.com"
  products      = jsondecode(file(coalesce(var.products_file, "${path.module}/../products.json")))
  live_products = { for name, product in local.products : name => product if product.live }

  checks = {
    every_ms   = 300000
    timeout_ms = 10000
    probes     = ["Frankfurt", "London"]
  }

  alerts = {
    contact_point   = "email"
    group_by        = ["grafana_folder", "alertname"]
    repeat_interval = "4h"
  }
}
