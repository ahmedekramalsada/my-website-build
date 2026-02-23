# Terraform Variables for UWBP

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "uwbp"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "East US"
}

variable "kubernetes_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.27.3"
}

variable "node_count" {
  description = "Initial node count"
  type        = number
  default     = 2
}

variable "node_min_count" {
  description = "Minimum node count for autoscaling"
  type        = number
  default     = 2
}

variable "node_max_count" {
  description = "Maximum node count for autoscaling"
  type        = number
  default     = 10
}

variable "node_vm_size" {
  description = "VM size for nodes"
  type        = string
  default     = "Standard_D2s_v3"
}

variable "postgres_admin_username" {
  description = "PostgreSQL admin username"
  type        = string
  default     = "uwbpadmin"
}

variable "postgres_admin_password" {
  description = "PostgreSQL admin password"
  type        = string
  sensitive   = true
}
