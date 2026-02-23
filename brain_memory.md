# 🧠 Project Memory - Universal Website Builder Platform (UWBP) 2026

## 📌 Project Overview
- **Name**: Universal Website Builder Platform (UWBP) 2026
- **Purpose**: Cloud-agnostic, multi-tenant website builder orchestration system.
- **Tech Stack**:
  - **Backend**: Node.js, Express, Dockerode, Kubernetes Client.
  - **Frontend**: React 18, Tailwind CSS, Zustand, React Query.
  - **Infrastructure**: Docker Compose, Kubernetes (EKS, AKS, GKE), Terraform.
  - **Services**: PostgreSQL, Redis, Traefik, MinIO, Prometheus, Grafana.

## 🏗️ Core Architecture
- **Control Plane API**: Orchestrates container/namespace creation and life-cycle.
- **Isolations**: Namespaces (K8s) or Docker networks.
- **Templates**: Next.js, React, Static, Node.js, Python, Custom Dockerfiles.

## ✅ Last Known Status (March 2026)
- **Production Ready**: All core features implemented.
- **Features**: Auth, Website CRUD, Deployment, Monitoring, Multi-cloud support.
- **Documentation**: Comprehensive README, PROJECT_PLAN, DEPLOYMENT_GUIDE.
- **Local Run Fixes**:
  - Switched from `bcrypt` to `bcryptjs` for binary compatibility across environments.
  - Fixed SQL syntax error in `deploymentService.js`.
  - Updated `Dockerfile` with build dependencies.
  - Fixed Traefik routing by removing redundant `/api` prefix stripping.
  - Disabled database SSL requirement for local dev in `config/index.js`.

## 🛠️ Known Issues & Fixes
- **ISSUE**: `bcrypt` fails with "Exec format error" in Docker on some architectures.
- **FIX**: Use `bcryptjs` (pure JS) to ensure portability.
- **ISSUE**: SQL Syntax error in `deploymentService.js` (missing parenthesis).
- **FIX**: Corrected the `UPDATE` query string.
- **ISSUE**: Registration (and all API calls) returned 404 through Traefik.
- **FIX**: Removed `stripprefix` middleware in `docker-compose.yml` because the backend already handles its own `/api` prefix.
- **ISSUE**: Registration failed with "The server does not support SSL connections".
- **FIX**: Set `DB_SSL` check in `config/index.js` to false for local Docker connections.

## 💡 Future Ideas & Enhancements
- [ ] Custom Domains & SSL (Let's Encrypt integration).
- [ ] CI/CD Webhooks (GitHub/GitLab).
- [ ] Template Marketplace.
- [ ] CLI Tool for power users.
- [ ] Automated Backup & Restore.

## 🛠️ Recurring Tasks
- [ ] Update README on every change.
- [ ] Suggest best practices with every edit.
- [ ] Sync with git and provide commit messages.
