output "api_url" {
  value = "http://${aws_lightsail_static_ip.app.ip_address}"
}

output "ssh_host" {
  value = "${aws_lightsail_instance.app.username}@${aws_lightsail_static_ip.app.ip_address}"
}

output "image_name" {
  value = "showpad:${var.image_tag}"
}

output "instance_name" {
  value = aws_lightsail_instance.app.name
}

output "region" {
  value = var.region
}
