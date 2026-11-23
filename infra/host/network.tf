resource "aws_vpc" "main" {
  cidr_block           = local.network.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = local.network.name
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = local.network.name
  }
}

resource "aws_subnet" "host" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.network.subnet_cidr
  availability_zone       = local.network.zone
  map_public_ip_on_launch = false

  tags = {
    Name = "${local.network.name}-host"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${local.network.name}-public"
  }
}

resource "aws_route" "internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "host" {
  subnet_id      = aws_subnet.host.id
  route_table_id = aws_route_table.public.id
}

resource "aws_default_security_group" "main" {
  vpc_id  = aws_vpc.main.id
  ingress = []
  egress  = []

  tags = {
    Name = "${local.network.name}-default-closed"
  }
}

resource "aws_security_group" "host" {
  name        = local.host.name
  description = "The host opens no port. It may reach out to anywhere"
  vpc_id      = aws_vpc.main.id
  ingress     = []

  egress {
    description = "Out to anywhere: updates, images, the AWS services and the telemetry"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = local.host.name
  }
}
