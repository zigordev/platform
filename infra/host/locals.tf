locals {
  region = "eu-west-1"

  tags = {
    managed-by = "opentofu"
    repo       = "zigordev/platform"
    stack      = "host"
  }

  network = {
    name        = "platform"
    vpc_cidr    = "10.20.0.0/16"
    subnet_cidr = "10.20.0.0/24"
    zone        = "eu-west-1a"
  }

  host = {
    name          = "platform-host"
    instance_type = "t4g.medium"
    system_gb     = 20
    image         = "/aws/service/canonical/ubuntu/server/26.04/stable/current/arm64/hvm/ebs-gp3/ami-id"
  }

  data_disk = {
    name    = "platform-data"
    size_gb = 10
    device  = "/dev/sdf"
  }

  host_files_root = "${path.module}/../../host/root"
}
