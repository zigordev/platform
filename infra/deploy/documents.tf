resource "aws_ssm_document" "deploy" {
  for_each = local.targets

  name            = "platform-deploy-${each.key}"
  document_type   = "Command"
  document_format = "JSON"
  target_type     = "/AWS::EC2::Instance"

  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Runs one commit of ${each.key} from main of zigordev/${each.value.repo} on the host, or rolls it back"
    parameters = {
      action = {
        type          = "String"
        description   = "deploy, or rollback"
        allowedValues = ["deploy", "rollback"]
      }
      commit = {
        type           = "String"
        description    = "The full SHA of a commit on main. For rollback, the commit that runs and goes"
        allowedPattern = "^[0-9a-f]{40}$"
      }
      images = {
        type           = "String"
        description    = "Each image of the commit with the digest the pipeline verified, separated by spaces. Empty for rollback"
        default        = ""
        allowedPattern = local.images_pattern
      }
    }
    mainSteps = [
      {
        action = "aws:runShellScript"
        name   = "deploy"
        inputs = {
          timeoutSeconds = "900"
          runCommand = [
            "${local.script} --target ${each.key} --repo ${each.value.repo} --dir ${each.value.dir} --action '{{ action }}' --commit '{{ commit }}' --images '{{ images }}'",
          ]
        }
      },
    ]
  })
}
