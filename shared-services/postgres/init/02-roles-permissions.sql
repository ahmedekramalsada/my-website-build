-- Enhanced Role and Permission System Schema
-- Run this after 01-schema.sql

-- ==========================================
-- PERMISSIONS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_permissions_name ON permissions(name);
CREATE INDEX idx_permissions_category ON permissions(category);

-- ==========================================
-- ROLES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT false,
    permissions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_roles_name ON roles(name);
CREATE INDEX idx_roles_is_system ON roles(is_system);

-- ==========================================
-- USER ROLES JUNCTION TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- ==========================================
-- API KEYS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(10) NOT NULL,
    permissions JSONB DEFAULT '[]'::jsonb,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_active ON api_keys(is_active);

-- ==========================================
-- INSERT DEFAULT PERMISSIONS
-- ==========================================
INSERT INTO permissions (name, display_name, description, category) VALUES
-- User management
('users.view', 'View Users', 'View user list and details', 'users'),
('users.create', 'Create Users', 'Create new user accounts', 'users'),
('users.update', 'Update Users', 'Edit user information', 'users'),
('users.delete', 'Delete Users', 'Delete user accounts', 'users'),
('users.manage_roles', 'Manage User Roles', 'Assign and remove user roles', 'users'),
-- Website management
('websites.view', 'View Websites', 'View website list and details', 'websites'),
('websites.create', 'Create Websites', 'Create new websites', 'websites'),
('websites.update', 'Update Websites', 'Edit website configuration', 'websites'),
('websites.delete', 'Delete Websites', 'Delete websites', 'websites'),
('websites.deploy', 'Deploy Websites', 'Deploy and manage website containers', 'websites'),
('websites.manage_all', 'Manage All Websites', 'Manage websites owned by any user', 'websites'),
-- System management
('system.settings', 'Manage System Settings', 'Edit platform configuration', 'system'),
('system.logs', 'View System Logs', 'View activity and audit logs', 'system'),
('system.health', 'View System Health', 'View system health metrics', 'system'),
('system.maintenance', 'Toggle Maintenance Mode', 'Enable/disable maintenance mode', 'system'),
-- Role management
('roles.view', 'View Roles', 'View role list and permissions', 'roles'),
('roles.create', 'Create Roles', 'Create new custom roles', 'roles'),
('roles.update', 'Update Roles', 'Edit role permissions', 'roles'),
('roles.delete', 'Delete Roles', 'Delete custom roles', 'roles'),
-- API Key management
('apikeys.view', 'View API Keys', 'View API key list', 'apikeys'),
('apikeys.create', 'Create API Keys', 'Create new API keys', 'apikeys'),
('apikeys.delete', 'Delete API Keys', 'Revoke API keys', 'apikeys'),
-- Domain management
('domains.view', 'View Domains', 'View domain configurations', 'domains'),
('domains.create', 'Add Domains', 'Add custom domains', 'domains'),
('domains.delete', 'Remove Domains', 'Remove custom domains', 'domains'),
('domains.manage_ssl', 'Manage SSL Certificates', 'Manage SSL certificates', 'domains'),
-- Deployment management
('deployments.view', 'View Deployments', 'View deployment history', 'deployments'),
('deployments.rollback', 'Rollback Deployments', 'Rollback to previous deployments', 'deployments')
ON CONFLICT (name) DO NOTHING;

-- ==========================================
-- INSERT DEFAULT ROLES
-- ==========================================
INSERT INTO roles (name, display_name, description, is_system, permissions) VALUES
('super_admin', 'Super Administrator', 'Full platform access with all permissions', true,
 '["users.view", "users.create", "users.update", "users.delete", "users.manage_roles",
   "websites.view", "websites.create", "websites.update", "websites.delete", "websites.deploy", "websites.manage_all",
   "system.settings", "system.logs", "system.health", "system.maintenance",
   "roles.view", "roles.create", "roles.update", "roles.delete",
   "apikeys.view", "apikeys.create", "apikeys.delete",
   "domains.view", "domains.create", "domains.delete", "domains.manage_ssl",
   "deployments.view", "deployments.rollback"]'::jsonb),
('admin', 'Administrator', 'Standard administrator with most permissions', true,
 '["users.view", "users.create", "users.update",
   "websites.view", "websites.create", "websites.update", "websites.delete", "websites.deploy", "websites.manage_all",
   "system.logs", "system.health",
   "roles.view",
   "apikeys.view", "apikeys.create", "apikeys.delete",
   "domains.view", "domains.create", "domains.delete",
   "deployments.view"]'::jsonb),
('user', 'Standard User', 'Regular user with standard permissions', true,
 '["websites.view", "websites.create", "websites.update", "websites.delete", "websites.deploy",
   "apikeys.view", "apikeys.create", "apikeys.delete",
   "domains.view", "domains.create", "domains.delete",
   "deployments.view"]'::jsonb),
('viewer', 'Viewer', 'Read-only access to resources', true,
 '["websites.view", "domains.view", "apikeys.view", "deployments.view"]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- ==========================================
-- FUNCTIONS
-- ==========================================

-- Function to get all permissions for a user
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id UUID)
RETURNS TABLE(permission_name VARCHAR(100)) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT p.name::VARCHAR(100)
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    CROSS JOIN LATERAL jsonb_array_elements_text(r.permissions) AS perm_text
    JOIN permissions p ON p.name = perm_text
    WHERE ur.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user has permission
CREATE OR REPLACE FUNCTION user_has_permission(p_user_id UUID, p_permission VARCHAR(100))
RETURNS BOOLEAN AS $$
DECLARE
    has_perm BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = p_user_id
        AND (r.permissions ? p_permission OR r.permissions ? '*')
    ) INTO has_perm;
    
    RETURN has_perm;
END;
$$ LANGUAGE plpgsql;

-- Function to assign role to user
CREATE OR REPLACE FUNCTION assign_role_to_user(p_user_id UUID, p_role_id UUID, p_assigned_by UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO user_roles (user_id, role_id, assigned_by)
    VALUES (p_user_id, p_role_id, p_assigned_by)
    ON CONFLICT (user_id, role_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Function to remove role from user
CREATE OR REPLACE FUNCTION remove_role_from_user(p_user_id UUID, p_role_id UUID)
RETURNS VOID AS $$
BEGIN
    DELETE FROM user_roles WHERE user_id = p_user_id AND role_id = p_role_id;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- TRIGGERS
-- ==========================================

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- VIEWS
-- ==========================================

-- User with roles view
CREATE OR REPLACE VIEW users_with_roles AS
SELECT 
    u.id,
    u.email,
    u.full_name,
    u.is_active,
    u.email_verified,
    u.created_at,
    u.last_login_at,
    COALESCE(
        json_agg(
            json_build_object(
                'id', r.id,
                'name', r.name,
                'display_name', r.display_name
            )
        ) FILTER (WHERE r.id IS NOT NULL),
        '[]'::json
    ) as roles
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN roles r ON ur.role_id = r.id
GROUP BY u.id;

-- Role with user count view
CREATE OR REPLACE VIEW roles_with_stats AS
SELECT 
    r.*,
    COUNT(ur.user_id) as user_count
FROM roles r
LEFT JOIN user_roles ur ON r.id = ur.role_id
GROUP BY r.id;

-- ==========================================
-- COMMENTS
-- ==========================================

COMMENT ON TABLE permissions IS 'Available permissions in the system';
COMMENT ON TABLE roles IS 'User roles with assigned permissions';
COMMENT ON TABLE user_roles IS 'Junction table for user-role assignments';
COMMENT ON TABLE api_keys IS 'API keys for programmatic access';
COMMENT ON FUNCTION get_user_permissions IS 'Returns all permissions for a user';
COMMENT ON FUNCTION user_has_permission IS 'Checks if user has specific permission';