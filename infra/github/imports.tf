locals {
  imported = {
    toolkit  = { ruleset_id = 27811287 }
    platform = { ruleset_id = 27858350 }
  }
}

import {
  for_each = var.adopt_existing ? local.imported : {}
  to       = github_repository.repo[each.key]
  id       = each.key
}

import {
  for_each = var.adopt_existing ? local.imported : {}
  to       = github_repository_ruleset.main[each.key]
  id       = "${each.key}:${each.value.ruleset_id}"
}

import {
  for_each = var.adopt_existing ? local.imported : {}
  to       = github_repository_environment.release[each.key]
  id       = "${each.key}:${local.release.environment}"
}

import {
  for_each = var.adopt_existing ? local.imported : {}
  to       = github_workflow_repository_permissions.token[each.key]
  id       = each.key
}

import {
  for_each = var.adopt_existing ? local.imported : {}
  to       = github_repository_vulnerability_alerts.alerts[each.key]
  id       = each.key
}

import {
  for_each = var.adopt_existing ? local.imported : {}
  to       = github_repository_dependabot_security_updates.updates[each.key]
  id       = each.key
}
