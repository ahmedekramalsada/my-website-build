# Azure DevOps Pipeline for UWBP

## Overview

This directory contains Azure DevOps pipeline configuration for the Universal Website Builder Platform.

## Prerequisites

1. **Azure Container Registry (ACR)**
   - Create an ACR instance
   - Configure service connection in Azure DevOps

2. **Azure Kubernetes Service (AKS)**
   - Create AKS cluster
   - Configure Kubernetes service connection

3. **Service Connections**
   - `uwbp-acr-connection`: Docker Registry connection to ACR
   - `uwbp-aks-connection`: Kubernetes connection to AKS

## Pipeline Stages

### Stage 1: Build
- Run API tests
- Run Dashboard tests
- Build and push Docker images to ACR
- Tag images with build ID and `latest`

### Stage 2: Deploy to Development
- Triggered on `develop` branch
- Deploys to `uwbp-dev` namespace
- Uses Kubernetes manifests from `infrastructure/kubernetes/`

### Stage 3: Deploy to Production
- Triggered on `main` branch
- Uses canary deployment strategy (25% → 50% → 100%)
- Automatic rollback on failure

### Stage 4: Smoke Tests
- Runs health checks on deployed services
- Validates API and Dashboard accessibility

## Setup Instructions

1. **Create Service Connections**
   ```bash
   # In Azure DevOps Project Settings → Service Connections
   # Create Docker Registry connection to ACR
   # Create Kubernetes connection to AKS
   ```

2. **Configure Pipeline**
   - Import `azure-pipelines.yml` into Azure DevOps
   - Set up variable groups for secrets
   - Configure branch policies

3. **Set Up Environments**
   - Create `uwbp-dev` environment
   - Create `uwbp-prod` environment with approvals

## Security Best Practices

- Use variable groups for sensitive data
- Enable branch policies for main branch
- Require approvals for production deployments
- Use managed identities where possible
