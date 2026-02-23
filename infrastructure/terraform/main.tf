# Universal Website Builder Platform - Terraform Configuration
# Infrastructure as Code for Azure deployment

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
  }
  
  backend "azurerm" {
    resource_group_name  = "uwbp-tfstate-rg"
    storage_account_name = "uwbpterraformstate"
    container_name       = "tfstate"
    key                  = "uwbp.terraform.tfstate"
  }
}

# Configure Azure Provider
provider "azurerm" {
  features {
    resource_group {
      prevent_deletion_if_contains_resources = false
    }
  }
}

# Resource Group
resource "azurerm_resource_group" "uwbp" {
  name     = "${var.project_name}-${var.environment}-rg"
  location = var.location
  
  tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "Terraform"
  }
}

# Virtual Network
resource "azurerm_virtual_network" "uwbp" {
  name                = "${var.project_name}-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.uwbp.location
  resource_group_name = azurerm_resource_group.uwbp.name
  
  tags = azurerm_resource_group.uwbp.tags
}

# Subnets
resource "azurerm_subnet" "aks" {
  name                 = "aks-subnet"
  resource_group_name  = azurerm_resource_group.uwbp.name
  virtual_network_name = azurerm_virtual_network.uwbp.name
  address_prefixes     = ["10.0.1.0/24"]
}

resource "azurerm_subnet" "postgresql" {
  name                 = "postgresql-subnet"
  resource_group_name  = azurerm_resource_group.uwbp.name
  virtual_network_name = azurerm_virtual_network.uwbp.name
  address_prefixes     = ["10.0.2.0/24"]
  service_endpoints    = ["Microsoft.Sql"]
}

# Azure Container Registry
resource "azurerm_container_registry" "uwbp" {
  name                = "${var.project_name}acr${var.environment}"
  resource_group_name = azurerm_resource_group.uwbp.name
  location            = azurerm_resource_group.uwbp.location
  sku                 = "Standard"
  admin_enabled       = true
  
  tags = azurerm_resource_group.uwbp.tags
}

# Azure Kubernetes Service
resource "azurerm_kubernetes_cluster" "uwbp" {
  name                = "${var.project_name}-${var.environment}-aks"
  location            = azurerm_resource_group.uwbp.location
  resource_group_name = azurerm_resource_group.uwbp.name
  dns_prefix          = "${var.project_name}-${var.environment}"
  kubernetes_version  = var.kubernetes_version
  
  default_node_pool {
    name                = "default"
    node_count          = var.node_count
    vm_size             = var.node_vm_size
    type                = "VirtualMachineScaleSets"
    zones               = [1, 2, 3]
    enable_auto_scaling = true
    min_count           = var.node_min_count
    max_count           = var.node_max_count
    vnet_subnet_id      = azurerm_subnet.aks.id
  }
  
  identity {
    type = "SystemAssigned"
  }
  
  network_profile {
    network_plugin    = "azure"
    load_balancer_sku = "standard"
  }
  
  tags = azurerm_resource_group.uwbp.tags
}

# Attach ACR to AKS
resource "azurerm_role_assignment" "aks_acr_pull" {
  scope                = azurerm_container_registry.uwbp.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_kubernetes_cluster.uwbp.kubelet_identity[0].object_id
}

# PostgreSQL Flexible Server
resource "azurerm_postgresql_flexible_server" "uwbp" {
  name                   = "${var.project_name}-${var.environment}-postgres"
  resource_group_name    = azurerm_resource_group.uwbp.name
  location               = azurerm_resource_group.uwbp.location
  version                = "15"
  administrator_login    = var.postgres_admin_username
  administrator_password = var.postgres_admin_password
  storage_mb             = 32768
  sku_name               = "B_Standard_B1ms"
  zone                   = "1"
  
  delegated_subnet_id = azurerm_subnet.postgresql.id
  private_dns_zone_id = azurerm_private_dns_zone.postgresql.id
  
  tags = azurerm_resource_group.uwbp.tags
}

resource "azurerm_private_dns_zone" "postgresql" {
  name                = "${var.project_name}-${var.environment}.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.uwbp.name
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgresql" {
  name                  = "${var.project_name}-postgres-link"
  private_dns_zone_name = azurerm_private_dns_zone.postgresql.name
  resource_group_name   = azurerm_resource_group.uwbp.name
  virtual_network_id    = azurerm_virtual_network.uwbp.id
}

# Redis Cache
resource "azurerm_redis_cache" "uwbp" {
  name                = "${var.project_name}-${var.environment}-redis"
  location            = azurerm_resource_group.uwbp.location
  resource_group_name = azurerm_resource_group.uwbp.name
  capacity            = 1
  family              = "C"
  sku_name            = "Basic"
  enable_non_ssl_port = false
  minimum_tls_version = "1.2"
  
  redis_configuration {
    maxmemory_policy = "allkeys-lru"
  }
  
  tags = azurerm_resource_group.uwbp.tags
}

# Storage Account for MinIO / File storage
resource "azurerm_storage_account" "uwbp" {
  name                     = "${var.project_name}storage${var.environment}"
  resource_group_name      = azurerm_resource_group.uwbp.name
  location                 = azurerm_resource_group.uwbp.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_2"
  
  tags = azurerm_resource_group.uwbp.tags
}

# Log Analytics Workspace for monitoring
resource "azurerm_log_analytics_workspace" "uwbp" {
  name                = "${var.project_name}-${var.environment}-logs"
  location            = azurerm_resource_group.uwbp.location
  resource_group_name = azurerm_resource_group.uwbp.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  
  tags = azurerm_resource_group.uwbp.tags
}

# Application Insights
resource "azurerm_application_insights" "uwbp" {
  name                = "${var.project_name}-${var.environment}-appinsights"
  location            = azurerm_resource_group.uwbp.location
  resource_group_name = azurerm_resource_group.uwbp.name
  workspace_id        = azurerm_log_analytics_workspace.uwbp.id
  application_type    = "Node.JS"
  
  tags = azurerm_resource_group.uwbp.tags
}

# Outputs
output "aks_cluster_name" {
  value = azurerm_kubernetes_cluster.uwbp.name
}

output "aks_cluster_endpoint" {
  value = azurerm_kubernetes_cluster.uwbp.kube_config.0.host
}

output "acr_login_server" {
  value = azurerm_container_registry.uwbp.login_server
}

output "postgres_fqdn" {
  value     = azurerm_postgresql_flexible_server.uwbp.fqdn
  sensitive = true
}

output "redis_hostname" {
  value = azurerm_redis_cache.uwbp.hostname
}

output "application_insights_key" {
  value     = azurerm_application_insights.uwbp.instrumentation_key
  sensitive = true
}
