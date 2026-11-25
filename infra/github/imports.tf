import {
  for_each = var.adopt_existing ? toset(["notifications"]) : toset([])
  to       = github_repository.repo[each.key]
  id       = each.key
}
