mock_provider "aws" {
  mock_resource "aws_kms_key" {
    defaults = {
      arn    = "arn:aws:kms:eu-west-1:111122223333:key/11111111-2222-3333-4444-555555555555"
      key_id = "11111111-2222-3333-4444-555555555555"
    }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      arn = "arn:aws:s3:::zigordev-platform-backups"
      id  = "zigordev-platform-backups"
    }
  }

  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::111122223333:role/platform-snapshots"
    }
  }
}

run "nobody_can_delete_or_overwrite_a_dump_for_30_days" {
  command = plan

  assert {
    condition     = aws_s3_bucket.backups.object_lock_enabled
    error_message = "The bucket must hold Object Lock."
  }

  assert {
    condition     = one(one(aws_s3_bucket_object_lock_configuration.backups.rule).default_retention).mode == "COMPLIANCE"
    error_message = "The lock must be in compliance mode, which nobody can lift, the root user included. Record 0024 says why."
  }

  assert {
    condition     = one(one(aws_s3_bucket_object_lock_configuration.backups.rule).default_retention).days == 30
    error_message = "Each dump must be locked for the 30 days that toolkit's record 0023 keeps it."
  }

  assert {
    condition     = one(aws_s3_bucket_versioning.backups.versioning_configuration).status == "Enabled"
    error_message = "Object Lock works only in a versioned bucket."
  }

  assert {
    condition     = aws_s3_bucket.backups.force_destroy == false
    error_message = "The bucket must refuse to be deleted while it holds any dump."
  }
}

run "a_dump_expires_after_30_days_and_leaves_nothing_behind" {
  command = plan

  assert {
    condition = one([
      for rule in aws_s3_bucket_lifecycle_configuration.backups.rule : one(rule.expiration).days
      if rule.id == "expire-dumps-after-30-days"
    ]) == 30
    error_message = "A dump must expire after the 30 days that toolkit's record 0023 keeps it."
  }

  assert {
    condition = one([
      for rule in aws_s3_bucket_lifecycle_configuration.backups.rule : one(rule.noncurrent_version_expiration).noncurrent_days
      if rule.id == "expire-dumps-after-30-days"
    ]) == 1
    error_message = "An expired dump must be removed a day later, so deleted data leaves the backups within 31 days."
  }

  assert {
    condition = one([
      for rule in aws_s3_bucket_lifecycle_configuration.backups.rule : one(rule.expiration).expired_object_delete_marker
      if rule.id == "remove-delete-markers-left-alone"
    ])
    error_message = "The markers that an expiry leaves must be removed too."
  }
}

run "the_dumps_are_private_and_encrypted_with_their_own_key" {
  command = plan

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.backups.block_public_acls,
      aws_s3_bucket_public_access_block.backups.block_public_policy,
      aws_s3_bucket_public_access_block.backups.ignore_public_acls,
      aws_s3_bucket_public_access_block.backups.restrict_public_buckets,
    ])
    error_message = "The bucket must block every kind of public access."
  }

  assert {
    condition = one([
      for rule in aws_s3_bucket_server_side_encryption_configuration.backups.rule :
      one(rule.apply_server_side_encryption_by_default).kms_master_key_id
    ]) == aws_kms_key.backups.arn
    error_message = "The dumps must be encrypted with their own key, as toolkit's record 0035 says."
  }

  assert {
    condition     = aws_kms_key.backups.enable_key_rotation && aws_kms_key.backups.deletion_window_in_days == 30
    error_message = "The key must rotate by itself, and a deletion must wait 30 days, so it can be cancelled."
  }

  assert {
    condition = jsondecode(aws_s3_bucket_policy.backups.policy).Statement[0].Condition == {
      Bool = { "aws:SecureTransport" = "false" }
    }
    error_message = "A request without TLS must be refused."
  }
}

run "the_host_may_add_and_read_dumps_but_never_delete_or_unlock_one" {
  command = plan

  assert {
    condition     = aws_iam_role_policy.host.role == "platform-host"
    error_message = "The rights belong to the host's own role."
  }

  assert {
    condition = toset(flatten([
      for statement in jsondecode(aws_iam_role_policy.host.policy).Statement : statement.Action
    ])) == toset(["s3:PutObject", "s3:GetObject", "s3:ListBucket", "kms:GenerateDataKey", "kms:Decrypt"])
    error_message = "The host may add, read and list dumps, and use the key for them. It may never delete a dump, change its lock or touch the bucket's settings."
  }

  assert {
    condition = alltrue([
      for statement in jsondecode(aws_iam_role_policy.host.policy).Statement :
      startswith(statement.Resource, "arn:aws:s3:::zigordev-platform-backups") || statement.Resource == aws_kms_key.backups.arn
    ])
    error_message = "The host's rights reach this bucket and its key, and nothing else."
  }
}

run "the_data_disk_gets_a_snapshot_every_day_and_keeps_seven" {
  command = plan

  assert {
    condition     = one(aws_dlm_lifecycle_policy.data_disk.policy_details).target_tags == tomap({ Name = "platform-data" })
    error_message = "The policy must find the host's data disk by its name tag."
  }

  assert {
    condition = alltrue([
      one(one(one(aws_dlm_lifecycle_policy.data_disk.policy_details).schedule).create_rule).interval == 24,
      one(one(one(aws_dlm_lifecycle_policy.data_disk.policy_details).schedule).create_rule).interval_unit == "HOURS",
      one(one(one(aws_dlm_lifecycle_policy.data_disk.policy_details).schedule).create_rule).times == tolist(["01:00"]),
    ])
    error_message = "A snapshot must be made once a day at 01:00 UTC, before the host's nightly restart at 03:00."
  }

  assert {
    condition     = one(one(one(aws_dlm_lifecycle_policy.data_disk.policy_details).schedule).retain_rule).count == 7
    error_message = "The 7 newest snapshots must be kept, as toolkit's record 0023 says."
  }

  assert {
    condition     = aws_iam_role_policy_attachment.snapshots.policy_arn == "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
    error_message = "Data Lifecycle Manager acts through AWS's own policy for snapshots."
  }

  assert {
    condition     = jsondecode(aws_iam_role.snapshots.assume_role_policy).Statement[0].Principal == { Service = "dlm.amazonaws.com" }
    error_message = "Only Data Lifecycle Manager may use the snapshot role."
  }
}
