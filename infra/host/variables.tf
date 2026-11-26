variable "host_files_root" {
  description = "The folder whose files the host gets at its first boot, each at the same path. Only the tests set it, to a folder of their own."
  type        = string
  default     = null
}
