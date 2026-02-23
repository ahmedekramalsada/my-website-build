# 🚀 Universal Website Builder Platform - Deployment Guide (2026)

## 📋 Overview

This guide covers **3 deployment options** for UWBP:

1. **Docker Compose** - Any VM or local machine (Simplest)
2. **AWS** - EKS + RDS + ElastiCache (Enterprise)
3. **Azure** - AKS + PostgreSQL + Redis (Enterprise)

---

## 🎯 Option 1: Docker Compose (Any VM / Local)

**Best for**: Quick start, development, small production (< 100 websites)

**Works on**: AWS EC2, Azure VM, GCP, DigitalOcean, Linode, local laptop, any Linux VM

### Requirements

- Linux VM (Ubuntu 22.04+ recommended)
- Docker 24.0+
- Docker Compose 2.20+
- 4GB RAM minimum (8GB recommended)
- 50GB storage

### Step-by-Step Deployment

```bash
# 1. SSH into your VM or open local terminal
ssh user@your-vm-ip

# 2. Install Docker (if not installed)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# 3. Clone or upload the project
cd /opt
# Upload project files or git clone

# 4. Configure environment
cd infrastructure/docker-compose
cp .env.example .env

# 5. Edit .env file with your settings
nano .env

# Required settings:
# - POSTGRES_PASSWORD: Strong password
# - JWT_SECRET: Generate with: openssl rand -base64 32
# - DOMAIN_SUFFIX: yourdomain.com (for production)

# 6. Deploy
chmod +x start.sh
./start.sh

# 7. Verify deployment
docker-compose ps
docker-compose logs -f api
```

### Access Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Dashboard | http://your-vm-ip | Register first user |
| API | http://your-vm-ip:8080 | JWT token required |
| Traefik | http://your-vm-ip:8081 | admin/admin |

### Production Considerations

```bash
# Enable firewall
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Setup SSL with Let's Encrypt (optional)
# Edit docker-compose.yml to enable Traefik SSL

# Setup auto-start on boot
sudo systemctl enable docker
```

---

## ☁️ Option 2: AWS Deployment (EKS)

**Best for**: Production, auto-scaling, high availability

### Architecture

- **EKS** (Elastic Kubernetes Service) - Container orchestration
- **RDS PostgreSQL** - Managed database
- **ElastiCache Redis** - Managed cache
- **S3** - Object storage
- **ALB** - Application Load Balancer
- **ECR** - Container registry

### Prerequisites

- AWS CLI configured
- Terraform 1.5+
- kubectl
- Docker

### Step 1: Deploy Infrastructure

```bash
cd infrastructure/terraform

# Create terraform.tfvars file
cat > aws.tfvars <<EOF
aws_region = "us-east-1"
environment = "production"
project_name = "uwbp"

db_password = "YourStrongPassword123!"
node_desired_size = 3
node_max_size = 20

# Optional: use larger instances for production
# node_instance_type = "t3.large"
EOF

# Initialize and apply
terraform init
terraform plan -var-file="aws.tfvars"
terraform apply -var-file="aws.tfvars"

# Save outputs
terraform output > aws-outputs.txt
```

### Step 2: Configure kubectl

```bash
# Update kubeconfig
aws eks update-kubeconfig \
  --region $(terraform output -raw aws_region) \
  --name $(terraform output -raw eks_cluster_name)

# Verify
kubectl get nodes
```

### Step 3: Build and Push Images

```bash
# Login to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $(terraform output -raw ecr_api_repository | cut -d'/' -f1)

# Build API image
cd ../../control-plane/api
docker build -t $(terraform output -raw ecr_api_repository):latest .
docker push $(terraform output -raw ecr_api_repository):latest

# Build Dashboard image
cd ../dashboard
docker build -t $(terraform output -raw ecr_dashboard_repository):latest .
docker push $(terraform output -raw ecr_dashboard_repository):latest
```

### Step 4: Deploy to EKS

```bash
cd ../../infrastructure/kubernetes

# Update image URLs in manifests
sed -i "s|image:.*api.*|image: $(terraform output -raw ecr_api_repository):latest|g" *.yaml
sed -i "s|image:.*dashboard.*|image: $(terraform output -raw ecr_dashboard_repository):latest|g" *.yaml

# Create namespace and secrets
kubectl apply -f 00-namespace.yaml

# Create secrets with AWS endpoints
kubectl create secret generic uwbp-secrets \
  --namespace uwbp \
  --from-literal=POSTGRES_PASSWORD="YourStrongPassword123!" \
  --from-literal=DATABASE_URL="postgresql://uwbp:YourStrongPassword123!@$(terraform output -raw rds_endpoint)/uwbp" \
  --from-literal=REDIS_URL="redis://$(terraform output -raw redis_endpoint):6379"

# Deploy services
kubectl apply -f .
```

### Step 5: Configure Ingress

```bash
# Install AWS Load Balancer Controller (if not installed)
# Follow: https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html

# Get load balancer URL
kubectl get ingress -n uwbp

# Configure DNS to point to ALB
```

### AWS Costs (Estimated)

| Component | Monthly Cost (t3.medium) |
|-----------|-------------------------|
| EKS Cluster | $73 |
| 2x EC2 (t3.medium) | $60 |
| RDS (db.t3.micro) | $13 |
| ElastiCache (t3.micro) | $12 |
| ALB | $16 + data processing |
| S3 | ~$5 |
| **Total** | **~$180/month** |

---

## ☁️ Option 3: Azure Deployment (AKS)

**Best for**: Microsoft ecosystem integration, hybrid cloud

### Architecture

- **AKS** (Azure Kubernetes Service)
- **Azure Database for PostgreSQL**
- **Azure Cache for Redis**
- **Azure Blob Storage**
- **Application Gateway**
- **Azure Container Registry**

### Prerequisites

- Azure CLI configured
- Terraform 1.5+
- kubectl

### Step 1: Deploy Infrastructure

```bash
cd infrastructure/terraform

# Use existing main.tf (Azure version)
cat > azure.tfvars <<EOF
location = "East US"
environment = "production"
project_name = "uwbp"

postgres_admin_password = "YourStrongPassword123!"
node_count = 3
node_max_count = 20
EOF

terraform init
terraform apply -var-file="azure.tfvars"
```

### Step 2: Deploy to AKS

```bash
# Get credentials
az aks get-credentials --resource-group uwbp-production-rg --name uwbp-production

# Deploy manifests
kubectl apply -f infrastructure/kubernetes/
```

---

## 🔧 Post-Deployment Configuration

### 1. Create First Admin User

```bash
# For Docker Compose
curl -X POST http://your-vm-ip:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourdomain.com",
    "password": "SecurePassword123!",
    "fullName": "System Administrator"
  }'
```

### 2. Configure Custom Domain (Optional)

```bash
# Edit DNS records
# A record: dashboard.yourdomain.com → your-vm-ip
# Wildcard: *.yourdomain.com → your-vm-ip (for subdomains)

# Update DOMAIN_SUFFIX in .env or K8s secrets
```

### 3. Enable SSL/TLS

**Docker Compose:**
```yaml
# In docker-compose.yml, enable Let's Encrypt
- "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
- "--certificatesresolvers.letsencrypt.acme.email=admin@yourdomain.com"
```

**AWS/Azure:**
- Use ACM (AWS) or App Gateway SSL (Azure)
- Or cert-manager in Kubernetes

---

## 📊 Monitoring & Maintenance

### Health Checks

```bash
# API health
curl http://your-domain/health

# Database
docker-compose exec postgres pg_isready -U uwbp

# Redis
docker-compose exec redis redis-cli ping
```

### Backup Strategy

**Database:**
```bash
# Automated backup script
#!/bin/bash
docker-compose exec -T postgres pg_dump -U uwbp uwbp > backup-$(date +%Y%m%d).sql
```

**Persistent Volumes:**
- AWS: EBS snapshots
- Azure: Managed disk backups
- Local: Regular rsync to external storage

### Scaling

**Docker Compose (Vertical):**
```bash
# Edit resource limits in docker-compose.yml
# Restart: docker-compose up -d
```

**Kubernetes (Horizontal):**
```bash
# Scale nodes
kubectl scale nodegroup --cluster=uwbp --nodes=5

# Scale pods
kubectl scale deployment api --replicas=3 -n uwbp
```

---

## 🚨 Troubleshooting

### Common Issues

**1. Services not starting**
```bash
# Check logs
docker-compose logs
kubectl logs -n uwbp deployment/api
```

**2. Database connection failed**
```bash
# Verify credentials
docker-compose exec postgres psql -U uwbp -c "\l"
```

**3. Website not accessible**
```bash
# Check Traefik routing
curl -H "Host: subdomain.localhost" http://localhost

# Check container status
docker ps | grep website-
```

**4. Out of resources**
```bash
# Check quotas
docker system df
kubectl describe resourcequota -n uwbp
```

---

## 🎉 Success Verification

After deployment, verify:

- [ ] Dashboard loads at configured URL
- [ ] Can register/login
- [ ] Can create website from template
- [ ] Website is accessible at subdomain
- [ ] Can stop/start website
- [ ] Can view container logs
- [ ] Resource quotas enforced

---

## 📞 Support

- **Documentation**: See `PROJECT_PLAN.md` for architecture details
- **API Reference**: Check `control-plane/api/src/routes/`
- **Issues**: Review logs with `docker-compose logs` or `kubectl logs`

---

**Ready to deploy! 🚀**

Choose your deployment option and follow the steps above. The system is production-ready for 2026 and beyond.
