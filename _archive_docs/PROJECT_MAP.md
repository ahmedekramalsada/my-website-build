# Project Map - Universal Website Builder Platform (UWBP)

> Quick reference guide for navigating and editing the codebase.

## 📁 Project Structure

```
my website build/
├── control-plane/           # Main application
│   ├── api/                 # Backend API (Node.js/Express)
│   │   ├── src/
│   │   │   ├── app.js       # Main Express app setup
│   │   │   ├── config/      # Configuration files
│   │   │   │   ├── index.js       # Main config (env vars, features)
│   │   │   │   ├── database.js    # PostgreSQL connection
│   │   │   │   └── redis.js       # Redis connection
│   │   │   ├── middleware/  # Express middleware
│   │   │   │   ├── auth.js        # JWT authentication
│   │   │   │   ├── permissions.js # RBAC permission checks
│   │   │   │   └── errorHandler.js
│   │   │   ├── routes/      # API endpoints
│   │   │   │   ├── admin.js       # Admin-only endpoints
│   │   │   │   ├── apiKeys.js     # API key management
│   │   │   │   ├── auth.js        # Login/register
│   │   │   │   ├── deployments.js # Deployment history
│   │   │   │   ├── domains.js     # Custom domains
│   │   │   │   ├── health.js      # System health metrics
│   │   │   │   ├── logs.js        # Activity logs
│   │   │   │   ├── roles.js       # Role management
│   │   │   │   ├── settings.js    # Platform settings
│   │   │   │   ├── uploads.js     # File uploads
│   │   │   │   ├── users.js       # User profile/settings
│   │   │   │   └── websites.js    # Website CRUD
│   │   │   ├── services/    # Business logic
│   │   │   │   ├── deploymentService.js
│   │   │   │   ├── dockerService.js
│   │   │   │   └── websiteService.js
│   │   │   └── utils/
│   │   │       └── logger.js
│   │   ├── scripts/
│   │   │   └── seed.js      # Database seeding
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── dashboard/           # Frontend (React)
│       ├── src/
│       │   ├── App.js       # Main app with routes
│       │   ├── index.js     # Entry point
│       │   ├── index.css    # Tailwind styles
│       │   ├── components/
│       │   │   └── Layout.js      # Sidebar layout
│       │   ├── pages/
│       │   │   ├── AdminDashboard.js  # Admin panel (7 tabs)
│       │   │   ├── CreateWebsite.js   # Website creation form
│       │   │   ├── Dashboard.js       # User dashboard
│       │   │   ├── Login.js
│       │   │   ├── Register.js
│       │   │   ├── Settings.js        # User settings (profile, security, API keys)
│       │   │   ├── UploadProject.js   # Project upload
│       │   │   ├── WebsiteDetail.js   # Website management (files, logs, settings)
│       │   │   └── Websites.js        # Website list
│       │   └── stores/
│       │       └── authStore.js  # Zustand auth state
│       ├── Dockerfile
│       └── package.json
│
├── infrastructure/
│   ├── docker-compose/
│   │   ├── docker-compose.yml  # Main compose file
│   │   ├── .env                # Environment variables
│   │   └── .env.example
│   ├── kubernetes/             # K8s manifests
│   ├── terraform/              # Infrastructure as code
│   └── monitoring/             # Prometheus/Grafana
│
├── shared-services/
│   └── postgres/
│       └── init/
│           ├── 01-schema.sql        # Main database schema
│           └── 02-roles-permissions.sql  # RBAC tables
│
└── plans/
    └── enhanced-admin-system-plan.md
```

## 🔑 Key Files to Edit

### Backend API

| What | File | Line Range |
|------|------|------------|
| Add new API route | `control-plane/api/src/app.js` | 30-50 |
| Add new endpoint | `control-plane/api/src/routes/*.js` | - |
| Change JWT secret | `infrastructure/docker-compose/.env` | - |
| Add permissions | `shared-services/postgres/init/02-roles-permissions.sql` | 74-110 |
| Modify roles | `shared-services/postgres/init/02-roles-permissions.sql` | 115-139 |
| Docker config | `control-plane/api/src/config/index.js` | - |
| Auth logic | `control-plane/api/src/routes/auth.js` | - |
| Admin endpoints | `control-plane/api/src/routes/admin.js` | - |

### Frontend Dashboard

| What | File | Line Range |
|------|------|------------|
| Add new page | `control-plane/dashboard/src/pages/*.js` | - |
| Add route | `control-plane/dashboard/src/App.js` | 35-55 |
| Modify sidebar | `control-plane/dashboard/src/components/Layout.js` | 24-33 |
| Admin dashboard tabs | `control-plane/dashboard/src/pages/AdminDashboard.js` | 200-250 |
| Website settings | `control-plane/dashboard/src/pages/WebsiteDetail.js` | 500-600 |
| User settings | `control-plane/dashboard/src/pages/Settings.js` | - |

### Database

| What | File |
|------|------|
| Users table | `shared-services/postgres/init/01-schema.sql` |
| Websites table | `shared-services/postgres/init/01-schema.sql` |
| Roles/Permissions | `shared-services/postgres/init/02-roles-permissions.sql` |
| System settings | `shared-services/postgres/init/01-schema.sql` |
| Activity logs | `shared-services/postgres/init/01-schema.sql` |

## 🚀 Quick Commands

```bash
# Start all services
cd infrastructure/docker-compose && docker compose up -d --build

# View logs
docker compose logs -f api

# Restart services
docker compose restart api dashboard

# Run database seed
docker compose exec api node scripts/seed.js

# Run SQL migration
docker compose exec -T postgres psql -U uwbp -d uwbp -f /docker-entrypoint-initdb.d/02-roles-permissions.sql

# Check container status
docker compose ps

# Access database
docker compose exec postgres psql -U uwbp -d uwbp
```

## 🔐 Admin Credentials

```
Email: admin@uwbp.local
Password: admin123
```

## 📡 API Endpoints

### Public
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register
- `GET /api/health` - Health check

### Authenticated
- `GET /api/auth/me` - Current user
- `GET /api/users/quota` - User quota
- `PUT /api/users/profile` - Update profile
- `PUT /api/users/password` - Change password

### Websites
- `GET /api/websites` - List websites
- `POST /api/websites` - Create website
- `GET /api/websites/:id` - Get website
- `PUT /api/websites/:id` - Update website
- `DELETE /api/websites/:id` - Delete website
- `POST /api/websites/:id/deploy` - Deploy
- `POST /api/websites/:id/start` - Start
- `POST /api/websites/:id/stop` - Stop
- `GET /api/websites/:id/logs` - Container logs

### Admin Only
- `GET /api/admin/stats` - Platform stats
- `GET /api/admin/users` - List users
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user
- `POST /api/admin/users/bulk` - Bulk user actions
- `GET /api/admin/websites` - List all websites
- `POST /api/admin/websites/bulk` - Bulk website actions

### Roles & Permissions
- `GET /api/roles` - List roles
- `POST /api/roles` - Create role
- `PUT /api/roles/:id` - Update role
- `DELETE /api/roles/:id` - Delete role
- `POST /api/roles/assign` - Assign role to user

### Settings
- `GET /api/settings` - Get platform settings
- `PUT /api/settings/:key` - Update setting

### API Keys
- `GET /api/api-keys` - List API keys
- `POST /api/api-keys` - Create API key
- `DELETE /api/api-keys/:id` - Delete API key

### Files
- `GET /api/uploads/:websiteId/files` - List files
- `GET /api/uploads/:websiteId/files/:filename` - Get file
- `PUT /api/uploads/:websiteId/files/:filename` - Update file
- `DELETE /api/uploads/:websiteId/files/:filename` - Delete file
- `POST /api/uploads/:websiteId/files` - Upload files

## 🎨 UI Components

The dashboard uses Tailwind CSS with custom classes defined in `index.css`:

```css
.btn-primary    # Primary button (indigo)
.btn-secondary  # Secondary button (gray)
.btn-danger     # Danger button (red)
.input          # Form input
.label          # Form label
.card           # White card container
```

## 🐳 Docker Services

| Service | Port | Description |
|---------|------|-------------|
| traefik | 80, 443 | Reverse proxy |
| api | 8080 (internal) | Backend API |
| dashboard | 80 (internal) | Frontend |
| postgres | 5432 | Database |
| redis | 6379 | Cache |
| minio | 9000, 9001 | Object storage |

## 📝 Environment Variables

Key environment variables in `infrastructure/docker-compose/.env`:

```env
# Database
POSTGRES_DB=uwbp
POSTGRES_USER=uwbp
POSTGRES_PASSWORD=uwbp

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h

# Admin
ADMIN_EMAIL=admin@uwbp.local
ADMIN_PASSWORD=admin123

# Features
REGISTRATION_ENABLED=true
```

## 🔄 Common Tasks

### Add a new API endpoint
1. Create route in `control-plane/api/src/routes/`
2. Import and use in `control-plane/api/src/app.js`
3. Add permission check if needed

### Add a new frontend page
1. Create component in `control-plane/dashboard/src/pages/`
2. Add route in `control-plane/dashboard/src/App.js`
3. Add nav link in `control-plane/dashboard/src/components/Layout.js`

### Add a new database table
1. Add schema in `shared-services/postgres/init/01-schema.sql`
2. Rebuild containers or run migration

### Add a new permission
1. Add to `permissions` table in `02-roles-permissions.sql`
2. Add to role's permissions array
3. Use in route with `requirePermission()`

## 🐛 Debugging

```bash
# API logs
docker compose logs -f api

# Database queries
docker compose exec postgres psql -U uwbp -d uwbp -c "SELECT * FROM users;"

# Redis
docker compose exec redis redis-cli

# Container shell
docker compose exec api sh
```

---

Last updated: 2026-02-23
