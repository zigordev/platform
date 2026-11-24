import {
  for_each = var.adopt_existing ? toset(["playground"]) : toset([])
  to       = github_repository.repo[each.key]
  id       = each.key
}
