variable "region" {
  type    = string
  default = "eu-west-3"
}

variable "name" {
  type    = string
  default = "showpad-demo"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,31}$", var.name))
    error_message = "Use 2 to 32 lowercase letters, digits, or hyphens, starting with a letter."
  }
}

variable "image_tag" {
  type    = string
  default = "latest"

  validation {
    condition     = can(regex("^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$", var.image_tag))
    error_message = "Provide a valid Docker image tag."
  }
}

variable "ssh_public_key_path" {
  type    = string
  default = "~/.ssh/showpad-demo.pub"

  validation {
    condition     = can(regex("^ssh-rsa ", file(pathexpand(var.ssh_public_key_path))))
    error_message = "Lightsail requires an RSA public key."
  }
}

variable "admin_cidr" {
  type = string

  validation {
    condition     = can(cidrhost(var.admin_cidr, 0)) && can(regex("^[0-9.]+/32$", var.admin_cidr))
    error_message = "Provide your public IPv4 address as a single /32 CIDR."
  }
}
