locals {
  repair_first_boot = [
    for line in split("\n", chomp(file("${path.module}/../../host/repair-first-boot"))) : line
    if !startswith(line, "#!")
  ]
}

resource "aws_ssm_document" "repair_first_boot" {
  name            = "${local.host.name}-repair-first-boot"
  document_type   = "Command"
  document_format = "JSON"
  target_type     = "/AWS::EC2::Instance"

  content = jsonencode({
    schemaVersion = "2.2"
    description   = "When the host's first boot found no setup, clear cloud-init and restart the host, at most 3 times"
    mainSteps = [
      {
        action = "aws:runShellScript"
        name   = "repairFirstBoot"
        inputs = {
          runCommand     = local.repair_first_boot
          timeoutSeconds = "900"
        }
      },
    ]
  })
}

resource "aws_ssm_association" "repair_first_boot" {
  association_name    = "${local.host.name}-repair-first-boot"
  name                = aws_ssm_document.repair_first_boot.name
  document_version    = aws_ssm_document.repair_first_boot.default_version
  schedule_expression = "rate(30 minutes)"

  targets {
    key    = "tag:Name"
    values = [local.host.name]
  }
}
