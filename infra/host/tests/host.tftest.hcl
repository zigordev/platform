mock_provider "aws" {
  mock_data "aws_ssm_parameter" {
    defaults = {
      insecure_value = "ami-0123456789abcdef0"
    }
  }

  mock_resource "aws_ebs_volume" {
    defaults = {
      id = "vol-0123456789abcdef0"
    }
  }

  mock_resource "aws_ssm_document" {
    defaults = {
      default_version = "1"
    }
  }
}

run "the_host_is_a_t4g_small_whose_cpu_credits_are_capped" {
  command = plan

  assert {
    condition     = aws_instance.host.instance_type == "t4g.small"
    error_message = "The host is a t4g.small."
  }

  assert {
    condition     = aws_instance.host.credit_specification[0].cpu_credits == "standard"
    error_message = "The CPU credits are capped, so a runaway process slows down instead of running up a bill."
  }

  assert {
    condition     = !aws_instance.host.monitoring
    error_message = "Detailed monitoring costs money, and Alloy reads the machine itself."
  }
}

run "the_host_starts_from_canonicals_ubuntu_26_04_for_arm" {
  command = plan

  assert {
    condition     = data.aws_ssm_parameter.ubuntu.name == "/aws/service/canonical/ubuntu/server/26.04/stable/current/arm64/hvm/ebs-gp3/ami-id"
    error_message = "The image is Canonical's Ubuntu 26.04 LTS for arm64, found through Canonical's own public parameter."
  }

  assert {
    condition     = aws_instance.host.ami == "ami-0123456789abcdef0"
    error_message = "The host takes the image that the parameter names."
  }
}

run "no_port_answers_from_outside" {
  command = plan

  assert {
    condition     = length(aws_security_group.host.ingress) == 0
    error_message = "The host's security group lets nothing in."
  }

  assert {
    condition     = length(aws_default_security_group.main.ingress) == 0 && length(aws_default_security_group.main.egress) == 0
    error_message = "The network's default security group holds no rule, so nothing can use it by accident."
  }

  assert {
    condition     = one(aws_security_group.host.egress).protocol == "-1" && one(aws_security_group.host.egress).cidr_blocks == tolist(["0.0.0.0/0"])
    error_message = "The host may reach out to anywhere, for updates, images and the AWS services."
  }
}

run "the_host_is_the_only_member_of_its_security_group" {
  command = plan

  assert {
    condition     = aws_instance.host.vpc_security_group_ids == toset([aws_security_group.host.id])
    error_message = "The host sits in its own closed security group and in no other."
  }
}

run "no_container_reaches_the_instance_role" {
  command = plan

  assert {
    condition     = aws_instance.host.metadata_options[0].http_tokens == "required"
    error_message = "The metadata service answers only with a session token."
  }

  assert {
    condition     = aws_instance.host.metadata_options[0].http_put_response_hop_limit == 1
    error_message = "The hop limit stays at 1, so a container, one hop further away, never reaches the metadata service."
  }
}

run "the_host_role_lets_systems_manager_in_and_reads_no_parameter_by_itself" {
  command = plan

  assert {
    condition     = jsondecode(aws_iam_role.host.assume_role_policy).Statement[0].Principal.Service == "ec2.amazonaws.com"
    error_message = "Only EC2 can take the host's role."
  }

  assert {
    condition     = strcontains(aws_iam_role_policy.host_systems_manager.policy, "ssmmessages:OpenDataChannel")
    error_message = "The role lets AWS Systems Manager open a shell on the host."
  }

  assert {
    condition     = !strcontains(aws_iam_role_policy.host_systems_manager.policy, "GetParameter")
    error_message = "Systems Manager's access reads no parameter. infra/deploy adds the few a deploy needs by name, so the host never reads the GitHub App's key."
  }
}

run "both_disks_are_encrypted_gp3_and_the_data_disk_sits_beside_the_host" {
  command = plan

  assert {
    condition = (
      aws_instance.host.root_block_device[0].volume_type == "gp3" &&
      aws_instance.host.root_block_device[0].encrypted &&
      aws_instance.host.root_block_device[0].volume_size == 20 &&
      aws_instance.host.root_block_device[0].delete_on_termination
    )
    error_message = "The system disk is an encrypted 20 GB gp3 disk that goes with the host."
  }

  assert {
    condition     = aws_ebs_volume.data.type == "gp3" && aws_ebs_volume.data.encrypted && aws_ebs_volume.data.size == 10
    error_message = "The data disk is an encrypted 10 GB gp3 disk."
  }

  assert {
    condition     = aws_ebs_volume.data.availability_zone == aws_subnet.host.availability_zone
    error_message = "The data disk sits in the host's zone, or it cannot be attached."
  }

  assert {
    condition     = aws_volume_attachment.data.stop_instance_before_detaching
    error_message = "The host stops before its data disk is detached, so every container stops cleanly first."
  }
}

run "a_change_to_the_setup_rebuilds_the_host" {
  command = plan

  assert {
    condition     = aws_instance.host.user_data_replace_on_change
    error_message = "The host is built from its user data at its first boot only, so a change to it must rebuild the host."
  }
}

run "the_user_data_writes_every_host_file_and_runs_the_setup" {
  command = plan

  assert {
    condition     = startswith(local.user_data, "#cloud-config\n")
    error_message = "cloud-init reads the user data as a cloud-config."
  }

  assert {
    condition     = aws_instance.host.user_data_base64 == base64gzip(local.user_data)
    error_message = "The user data is compressed, and cloud-init unpacks it by itself."
  }

  assert {
    condition     = length(aws_instance.host.user_data_base64) <= 21848
    error_message = "AWS takes at most 16 KB of user data, counted after compression: 21848 characters of base64."
  }

  assert {
    condition = alltrue([
      for file in local.host_files : contains([for entry in local.cloud_config.write_files : entry.path], "/${file}")
    ])
    error_message = "Every file under host/root is written to the same path on the host."
  }

  assert {
    condition = alltrue([
      for entry in local.cloud_config.write_files : entry.permissions == (startswith(entry.path, "/usr/local/sbin/") ? "0755" : "0644")
    ])
    error_message = "The scripts in /usr/local/sbin can run, and every other file is only readable."
  }

  assert {
    condition     = contains([for entry in local.cloud_config.write_files : entry.content if entry.path == "/etc/platform/host.env"], "PLATFORM_DATA_DEVICE=/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_vol0123456789abcdef0\n")
    error_message = "The host finds its data disk by the disk's own id."
  }

  assert {
    condition     = local.cloud_config.runcmd == [["/usr/local/sbin/platform-setup"]]
    error_message = "The first boot runs the setup script, and only that."
  }
}

run "a_first_boot_that_missed_its_setup_is_repaired_through_systems_manager" {
  command = plan

  assert {
    condition     = aws_ssm_association.repair_first_boot.targets[0].key == "tag:Name" && aws_ssm_association.repair_first_boot.targets[0].values == tolist([aws_instance.host.tags.Name])
    error_message = "The repair finds the host by its name tag, so a rebuilt host gets it too."
  }

  assert {
    condition     = aws_ssm_association.repair_first_boot.schedule_expression == "rate(30 minutes)"
    error_message = "The repair checks every 30 minutes, the shortest interval State Manager allows."
  }

  assert {
    condition     = aws_ssm_document.repair_first_boot.document_type == "Command" && aws_ssm_association.repair_first_boot.name == aws_ssm_document.repair_first_boot.name
    error_message = "The association runs the repair's own command document."
  }

  assert {
    condition     = jsondecode(aws_ssm_document.repair_first_boot.content).mainSteps[0].inputs.runCommand == local.repair_first_boot
    error_message = "The document runs exactly the lines of host/repair-first-boot."
  }

  assert {
    condition     = local.repair_first_boot[0] == "set -eu" && !anytrue([for line in local.repair_first_boot : startswith(line, "#!")])
    error_message = "The document runs the script under sh without its first line, and stops at the first error."
  }
}
