data "aws_ssm_parameter" "ubuntu" {
  name = local.host.image
}

resource "aws_ebs_volume" "data" {
  availability_zone = aws_subnet.host.availability_zone
  size              = local.data_disk.size_gb
  type              = "gp3"
  encrypted         = true

  tags = {
    Name = local.data_disk.name
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_instance" "host" {
  ami                         = data.aws_ssm_parameter.ubuntu.insecure_value
  instance_type               = local.host.instance_type
  subnet_id                   = aws_subnet.host.id
  vpc_security_group_ids      = [aws_security_group.host.id]
  associate_public_ip_address = true
  iam_instance_profile        = aws_iam_instance_profile.host.name
  monitoring                  = false
  user_data                   = local.user_data
  user_data_replace_on_change = true

  credit_specification {
    cpu_credits = "standard"
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "disabled"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = local.host.system_gb
    encrypted             = true
    delete_on_termination = true

    tags = {
      Name = "${local.host.name}-system"
    }
  }

  tags = {
    Name = local.host.name
  }

  lifecycle {
    ignore_changes = [ami]
  }
}

resource "aws_volume_attachment" "data" {
  device_name                    = local.data_disk.device
  volume_id                      = aws_ebs_volume.data.id
  instance_id                    = aws_instance.host.id
  stop_instance_before_detaching = true
}
