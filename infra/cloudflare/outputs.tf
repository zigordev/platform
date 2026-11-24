output "tunnel_name" {
  description = "The tunnel's name in Cloudflare, where the owner copies its token from"
  value       = cloudflare_zero_trust_tunnel_cloudflared.host.name
}

output "product_addresses" {
  description = "The address of every product"
  value       = sort([for record in cloudflare_dns_record.product : record.name])
}
