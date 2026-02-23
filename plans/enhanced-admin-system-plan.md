# Enhanced Admin System Implementation Plan

## Overview

This plan outlines the complete implementation of a powerful admin dashboard with full control over the platform, including advanced role management, user administration, and comprehensive monitoring capabilities.

## Current State Analysis

### Existing Features
- Basic admin role (admin/user only)
- User listing and basic management
- Website listing and basic management
- Platform statistics
- Simple enable/disable functionality

### Missing Features (To Be Implemented)
- Granular permission system
- Custom role creation
- Create new admin users
- Platform settings management
- Activity logs viewer
- System health monitoring
- Bulk operations
- Advanced search/filtering
- API key management

---

## Phase 1: Database Schema Enhancements

### 1.1 New Roles Table

```sql
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT false,          -- System roles cannot be deleted
    permissions JSONB DEFAULT '[]'::jsonb,    -- Array of permission strings
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 1.2 Permissions Table

```sql
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,        -- e.g., 'users.create', 'websites.delete'
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),                      -- e.g., 'users', 'websites', 'system'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 1.3 User Roles Junction Table

```sql
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role_id)
);
```

### 1.4 API Keys Table

```sql
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,           -- Hashed API key
    key_prefix VARCHAR(10) NOT NULL,          -- First 8 chars for identification
    permissions JSONB DEFAULT '[]'::jsonb,    -- Scoped permissions
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 1.5 Update Users Table

```sql
-- Remove the simple role column, use junction table instead
-- Keep for backward compatibility during migration
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_role_id UUID REFERENCES roles(id);
```

### 1.6 Default Roles and Permissions

```sql
-- Insert default permissions
INSERT INTO permissions (name, display_name, category) VALUES
-- User management
('users.view', 'View Users', 'users'),
('users.create', 'Create Users', 'users'),
('users.update', 'Update Users', 'users'),
('users.delete', 'Delete Users', 'users'),
('users.manage_roles', 'Manage User Roles', 'users'),
-- Website management
('websites.view', 'View Websites', 'websites'),
('websites.create', 'Create Websites', 'websites'),
('websites.update', 'Update Websites', 'websites'),
('websites.delete', 'Delete Websites', 'websites'),
('websites.deploy', 'Deploy Websites', 'websites'),
('websites.manage_all', 'Manage All Websites', 'websites'),
-- System management
('system.settings', 'Manage System Settings', 'system'),
('system.logs', 'View System Logs', 'system'),
('system.health', 'View System Health', 'system'),
('system.maintenance', 'Toggle Maintenance Mode', 'system'),
-- Role management
('roles.view', 'View Roles', 'roles'),
('roles.create', 'Create Roles', 'roles'),
('roles.update', 'Update Roles', 'roles'),
('roles.delete', 'Delete Roles', 'roles'),
-- API Key management
('apikeys.view', 'View API Keys', 'apikeys'),
('apikeys.create', 'Create API Keys', 'apikeys'),
('apikeys.delete', 'Delete API Keys', 'apikeys'),
-- Domain management
('domains.view', 'View Domains', 'domains'),
('domains.create', 'Add Domains', 'domains'),
('domains.delete', 'Remove Domains', 'domains'),
('domains.manage_ssl', 'Manage SSL Certificates', 'domains')
ON CONFLICT (name) DO NOTHING;

-- Insert default roles
INSERT INTO roles (name, display_name, description, is_system, permissions) VALUES
('super_admin', 'Super Administrator', 'Full platform access', true,
 '["users.view", "users.create", "users.update", "users.delete", "users.manage_roles",
   "websites.view", "websites.create", "websites.update", "websites.delete", "websites.deploy", "websites.manage_all",
   "system.settings", "system.logs", "system.health", "system.maintenance",
   "roles.view", "roles.create", "roles.update", "roles.delete",
   "apikeys.view", "apikeys.create", "apikeys.delete",
   "domains.view", "domains.create", "domains.delete", "domains.manage_ssl"]'::jsonb),
('admin', 'Administrator', 'Standard admin access', true,
 '["users.view", "users.create", "users.update",
   "websites.view", "websites.create", "websites.update", "websites.delete", "websites.deploy",
   "system.logs", "system.health",
   "roles.view",
   "apikeys.view", "apikeys.create", "apikeys.delete",
   "domains.view", "domains.create", "domains.delete"]'::jsonb),
('user', 'Standard User', 'Regular user access', true,
 '["websites.view", "websites.create", "websites.update", "websites.delete", "websites.deploy",
   "apikeys.view", "apikeys.create", "apikeys.delete",
   "domains.view", "domains.create", "domains.delete"]'::jsonb),
('viewer', 'Viewer', 'Read-only access', true,
 '["websites.view", "domains.view", "apikeys.view"]'::jsonb)
ON CONFLICT (name) DO NOTHING;
```

---

## Phase 2: Backend API Enhancements

### 2.1 Permission Middleware

```javascript
// middleware/permissions.js
const hasPermission = (permission) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userPermissions = await getUserPermissions(req.user.id);
    
    if (userPermissions.includes(permission) || userPermissions.includes('*')) {
      return next();
    }
    
    return res.status(403).json({ error: 'Forbidden', requiredPermission: permission });
  };
};

const hasAnyPermission = (permissions) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userPermissions = await getUserPermissions(req.user.id);
    
    if (permissions.some(p => userPermissions.includes(p)) || userPermissions.includes('*')) {
      return next();
    }
    
    return res.status(403).json({ error: 'Forbidden' });
  };
};
```

### 2.2 New API Endpoints

#### Roles Management
- `GET /api/admin/roles` - List all roles
- `POST /api/admin/roles` - Create new role
- `PUT /api/admin/roles/:id` - Update role
- `DELETE /api/admin/roles/:id` - Delete role (non-system only)

#### User Role Assignment
- `POST /api/admin/users/:id/roles` - Assign roles to user
- `DELETE /api/admin/users/:id/roles/:roleId` - Remove role from user

#### Platform Settings
- `GET /api/admin/settings` - Get all settings
- `PUT /api/admin/settings` - Update settings
- `POST /api/admin/settings/reset` - Reset to defaults

#### Activity Logs
- `GET /api/admin/logs` - Get activity logs with filtering
- `GET /api/admin/logs/export` - Export logs as CSV/JSON

#### System Health
- `GET /api/admin/health` - Detailed system health
- `GET /api/admin/metrics` - Platform metrics

#### API Keys
- `GET /api/api-keys` - List user API keys
- `POST /api/api-keys` - Create new API key
- `DELETE /api/api-keys/:id` - Revoke API key

#### Bulk Operations
- `POST /api/admin/users/bulk` - Bulk user operations
- `POST /api/admin/websites/bulk` - Bulk website operations

---

## Phase 3: Frontend Dashboard Enhancements

### 3.1 New Pages

#### Role Management Page
- List all roles with permissions
- Create/edit role modal
- Permission checkboxes by category
- Delete confirmation for non-system roles

#### Enhanced User Management
- User detail modal with role assignment
- Create new user/admin modal
- Bulk selection and operations
- Advanced search and filtering

#### Platform Settings Page
- General settings (platform name, registration, etc.)
- Resource limits configuration
- Maintenance mode toggle
- Email settings

#### Activity Logs Page
- Real-time log viewer
- Filter by user, action, resource
- Date range filtering
- Export functionality

#### System Health Dashboard
- Container status overview
- Resource usage charts
- Database health
- Redis health
- Storage usage

### 3.2 Enhanced AdminDashboard.js Structure

```jsx
// Tabs structure
const tabs = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'roles', label: 'Roles', icon: Shield },
  { id: 'websites', label: 'Websites', icon: Globe },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'logs', label: 'Activity Logs', icon: FileText },
  { id: 'health', label: 'System Health', icon: Activity },
];
```

---

## Phase 4: Security Enhancements

### 4.1 Audit Logging

Log all administrative actions:
- User creation/deletion/modification
- Role changes
- Settings changes
- Website deployments
- API key operations

### 4.2 Rate Limiting

- Stricter rate limits for admin endpoints
- Separate rate limit for API key authentication

### 4.3 Input Validation

- Comprehensive validation for all inputs
- SQL injection prevention
- XSS prevention

---

## Implementation Order

1. **Database Migration** - Create new tables and seed data
2. **Permission Middleware** - Implement permission checking
3. **Role API Endpoints** - CRUD for roles
4. **User Role Assignment** - Assign/remove roles
5. **Settings API** - Platform configuration
6. **Activity Logs API** - Log retrieval
7. **System Health API** - Health metrics
8. **API Key System** - Key generation and management
9. **Frontend Role Management** - UI for roles
10. **Enhanced User Management** - Full user admin UI
11. **Settings Page** - Platform configuration UI
12. **Activity Logs Page** - Log viewer UI
13. **System Health Page** - Monitoring UI
14. **Bulk Operations** - Multi-select actions
15. **Testing** - Comprehensive testing
16. **Documentation** - Update all docs

---

## File Changes Summary

### New Files to Create
- `control-plane/api/src/middleware/permissions.js` - Permission middleware
- `control-plane/api/src/routes/roles.js` - Role management routes
- `control-plane/api/src/routes/settings.js` - Settings routes
- `control-plane/api/src/routes/logs.js` - Activity logs routes
- `control-plane/api/src/routes/health.js` - Health check routes
- `control-plane/api/src/routes/apiKeys.js` - API key routes
- `control-plane/dashboard/src/pages/RoleManagement.js` - Role management UI
- `control-plane/dashboard/src/pages/PlatformSettings.js` - Settings UI
- `control-plane/dashboard/src/pages/ActivityLogs.js` - Logs viewer UI
- `control-plane/dashboard/src/pages/SystemHealth.js` - Health monitoring UI
- `shared-services/postgres/init/02-roles-permissions.sql` - Schema migration

### Files to Modify
- `shared-services/postgres/init/01-schema.sql` - Add new tables
- `control-plane/api/src/middleware/auth.js` - Add permission helpers
- `control-plane/api/src/routes/admin.js` - Enhance with permissions
- `control-plane/api/src/app.js` - Add new routes
- `control-plane/dashboard/src/pages/AdminDashboard.js` - Complete redesign
- `control-plane/dashboard/src/App.js` - Add new routes
- `control-plane/dashboard/src/components/Layout.js` - Add admin menu items

---

## Success Criteria

1. Admin can create custom roles with specific permissions
2. Admin can assign multiple roles to any user
3. Admin can create new admin users
4. All platform settings are editable from UI
5. Activity logs show all administrative actions
6. System health shows real-time metrics
7. Bulk operations work for users and websites
8. All endpoints have proper permission checks
9. All UI is responsive and user-friendly
10. No "coming soon" features - everything is functional
