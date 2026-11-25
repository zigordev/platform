locals {
  region = "eu-west-1"

  tags = {
    managed-by = "opentofu"
    repo       = "zigordev/platform"
    stack      = "backups"
  }

  bucket     = "zigordev-platform-backups"
  bucket_arn = "arn:aws:s3:::${local.bucket}"
  key_alias  = "alias/platform-backups"
  host_role  = "platform-host"

  dumps = {
    locked_days = 30
    kept_days   = 30
  }

  snapshots = {
    disk = "platform-data"
    time = "01:00"
    kept = 7
  }
}
