resource "aws_lightsail_key_pair" "app" {
  name       = "${var.name}-ssh"
  public_key = file(pathexpand(var.ssh_public_key_path))
}

resource "aws_lightsail_instance" "app" {
  name              = var.name
  availability_zone = "${var.region}a"
  blueprint_id      = "ubuntu_24_04"
  bundle_id         = "micro_3_0"
  ip_address_type   = "ipv4"
  key_pair_name     = aws_lightsail_key_pair.app.name
  tags              = { Name = var.name }
  user_data = "echo ${base64encode(templatefile("${path.module}/bootstrap.sh.tftpl", {
    image = "showpad:${var.image_tag}"
  }))} | base64 --decode | bash"
}

resource "aws_lightsail_instance_public_ports" "app" {
  instance_name = aws_lightsail_instance.app.name

  port_info {
    from_port = 80
    to_port   = 80
    protocol  = "tcp"
    cidrs     = ["0.0.0.0/0"]
  }

  port_info {
    from_port = 22
    to_port   = 22
    protocol  = "tcp"
    cidrs     = [var.admin_cidr]
  }
}

resource "aws_lightsail_static_ip" "app" {
  name = "${var.name}-ip"
}

resource "aws_lightsail_static_ip_attachment" "app" {
  static_ip_name = aws_lightsail_static_ip.app.name
  instance_name  = aws_lightsail_instance.app.name
}
