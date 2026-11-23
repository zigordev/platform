output "host_instance_id" {
  description = "The host's instance id, which a shell through AWS Systems Manager names as its target"
  value       = aws_instance.host.id
}
