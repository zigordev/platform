locals {
  host_files  = sort(tolist(fileset(local.host_files_root, "**")))
  data_device = "/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_${replace(aws_ebs_volume.data.id, "-", "")}"

  cloud_config = {
    write_files = concat(
      [
        for file in local.host_files : {
          path        = "/${file}"
          owner       = "root:root"
          permissions = startswith(file, "usr/local/sbin/") ? "0755" : "0644"
          content     = file("${local.host_files_root}/${file}")
        }
      ],
      [
        {
          path        = "/etc/platform/host.env"
          owner       = "root:root"
          permissions = "0644"
          content     = "PLATFORM_DATA_DEVICE=${local.data_device}\n"
        },
      ],
    )

    runcmd = [
      ["/usr/local/sbin/platform-setup"],
    ]

    power_state = {
      mode      = "reboot"
      condition = "test -f /var/run/reboot-required"
    }
  }

  user_data = "#cloud-config\n${jsonencode(local.cloud_config)}"
}
