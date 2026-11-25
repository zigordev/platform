resource "aws_kms_key" "backups" {
  description             = "Encrypts the database dumps of every zigordev product"
  enable_key_rotation     = true
  deletion_window_in_days = 30

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "backups" {
  name          = local.key_alias
  target_key_id = aws_kms_key.backups.key_id
}
