resource "aws_iam_role" "snapshots" {
  name        = "platform-snapshots"
  description = "Data Lifecycle Manager snapshots the host's data disk through it, every day"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "dlm.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "snapshots" {
  role       = aws_iam_role.snapshots.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}

resource "aws_dlm_lifecycle_policy" "data_disk" {
  description        = "Daily snapshot of the host data disk kept 7 days"
  execution_role_arn = aws_iam_role.snapshots.arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]

    target_tags = {
      Name = local.snapshots.disk
    }

    schedule {
      name      = "daily"
      copy_tags = true

      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = [local.snapshots.time]
      }

      retain_rule {
        count = local.snapshots.kept
      }

      tags_to_add = {
        made-by = "data-lifecycle-manager"
      }
    }
  }
}
