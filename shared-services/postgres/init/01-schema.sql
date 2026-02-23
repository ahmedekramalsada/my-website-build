-- Universal Website Builder Platform - Database Schema
-- This script initializes the database with all required tables and indexes

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- USERS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    quota_max_websites INTEGER DEFAULT 10,
    quota_max_cpu DECIMAL(4,2) DEFAULT 2.0,        -- Total CPU cores allowed
    quota_max_memory INTEGER DEFAULT 2048,         -- Total memory in MB allowed
    quota_max_storage INTEGER DEFAULT 10,          -- Total storage in GB allowed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ==========================================
-- WEBSITES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS websites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Unique identifiers
    subdomain VARCHAR(63) UNIQUE NOT NULL,           -- Auto-generated: abc123.localhost
    custom_domain VARCHAR(255),                    -- Optional: example.com
    
    -- Template and runtime info
    template_type VARCHAR(50) NOT NULL CHECK (template_type IN ('nextjs', 'nuxt', 'react', 'vue', 'static', 'nodejs', 'python', 'php', 'custom')),
    container_image VARCHAR(500),                  -- Docker image URL
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'deploying', 'running', 'stopped', 'error', 'suspended', 'deleted')),
    health_status VARCHAR(50) DEFAULT 'unknown' CHECK (health_status IN ('healthy', 'unhealthy', 'unknown')),
    
    -- Resource configuration (stored as JSON for flexibility)
    resource_config JSONB DEFAULT '{
        "cpu_limit": 0.5,
        "memory_limit": 512,
        "storage_limit": 1,
        "replicas": 1
    }'::jsonb,
    
    -- Environment variables (encrypted at application level)
    environment_vars JSONB DEFAULT '{}'::jsonb,
    
    -- Build configuration
    build_context TEXT,                            -- Git URL or path
    build_command VARCHAR(500),
    start_command VARCHAR(500),
    working_directory VARCHAR(500) DEFAULT '/app',
    
    -- Port configuration
    internal_port INTEGER DEFAULT 3000,
    
    -- Volumes and storage
    persistent_volumes JSONB DEFAULT '[]'::jsonb,
    
    -- Statistics
    deploy_count INTEGER DEFAULT 0,
    last_deployed_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,           -- Soft delete
    deleted_by UUID REFERENCES users(id)
);

-- Indexes for websites
CREATE INDEX idx_websites_owner ON websites(owner_id);
CREATE INDEX idx_websites_subdomain ON websites(subdomain);
CREATE INDEX idx_websites_status ON websites(status);
CREATE INDEX idx_websites_template ON websites(template_type);
CREATE INDEX idx_websites_created ON websites(created_at DESC);
CREATE INDEX idx_websites_not_deleted ON websites(deleted_at) WHERE deleted_at IS NULL;

-- ==========================================
-- WEBSITE DEPLOYMENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS website_deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    
    -- Deployment info
    version INTEGER NOT NULL,                      -- Incremental version number
    git_commit_hash VARCHAR(40),
    git_branch VARCHAR(255),
    
    -- Container details
    container_image VARCHAR(500) NOT NULL,
    container_id VARCHAR(255),                     -- Docker/K8s container ID
    container_logs TEXT,                           -- Last deployment logs
    
    -- Build info
    build_logs TEXT,
    build_duration_ms INTEGER,
    build_status VARCHAR(50) DEFAULT 'pending' CHECK (build_status IN ('pending', 'building', 'success', 'failed')),
    
    -- Deployment status
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'deploying', 'running', 'stopped', 'failed', 'rolled_back')),
    
    -- Environment at time of deployment
    environment_vars_snapshot JSONB,
    resource_config_snapshot JSONB,
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    
    -- Error info
    error_message TEXT,
    error_stack TEXT,
    
    -- Rollback info
    rolled_back_at TIMESTAMP WITH TIME ZONE,
    rolled_back_by UUID REFERENCES users(id),
    rollback_reason TEXT
);

-- Indexes for deployments
CREATE INDEX idx_deployments_website ON website_deployments(website_id);
CREATE INDEX idx_deployments_version ON website_deployments(website_id, version DESC);
CREATE INDEX idx_deployments_status ON website_deployments(status);
CREATE INDEX idx_deployments_created ON website_deployments(started_at DESC);

-- ==========================================
-- DOMAINS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    
    domain VARCHAR(255) UNIQUE NOT NULL,
    is_primary BOOLEAN DEFAULT false,              -- Is this the main domain?
    
    -- SSL Certificate
    ssl_status VARCHAR(50) DEFAULT 'pending' CHECK (ssl_status IN ('pending', 'active', 'expired', 'error')),
    ssl_cert TEXT,                                 -- Certificate (encrypted)
    ssl_key TEXT,                                  -- Private key (encrypted)
    ssl_issuer VARCHAR(100),
    ssl_expires_at TIMESTAMP WITH TIME ZONE,
    ssl_last_renewed_at TIMESTAMP WITH TIME ZONE,
    ssl_auto_renew BOOLEAN DEFAULT true,
    
    -- DNS verification
    dns_verified BOOLEAN DEFAULT false,
    dns_verification_record VARCHAR(255),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for domains
CREATE INDEX idx_domains_website ON domains(website_id);
CREATE INDEX idx_domains_domain ON domains(domain);
CREATE INDEX idx_domains_ssl_expires ON domains(ssl_expires_at) WHERE ssl_status = 'active';

-- ==========================================
-- WEBSITE METRICS TABLE (Time-series data)
-- ==========================================
CREATE TABLE IF NOT EXISTS website_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    
    -- Resource usage
    cpu_percent DECIMAL(5,2),                      -- CPU usage percentage
    memory_used_mb INTEGER,                        -- Memory usage in MB
    memory_total_mb INTEGER,
    disk_used_mb INTEGER,                          -- Disk usage in MB
    disk_total_mb INTEGER,
    network_rx_bytes BIGINT,                       -- Network received
    network_tx_bytes BIGINT,                       -- Network transmitted
    
    -- Application metrics
    requests_total INTEGER,                        -- Total requests
    requests_2xx INTEGER,
    requests_4xx INTEGER,
    requests_5xx INTEGER,
    avg_response_time_ms INTEGER,                  -- Average response time
    
    -- Timestamp (partitioned by time)
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for metrics
CREATE INDEX idx_metrics_website_time ON website_metrics(website_id, recorded_at DESC);
CREATE INDEX idx_metrics_recorded ON website_metrics(recorded_at DESC);

-- Create hypertable for time-series data (if using TimescaleDB)
-- SELECT create_hypertable('website_metrics', 'recorded_at');

-- ==========================================
-- ACTIVITY LOGS TABLE (Audit trail)
-- ==========================================
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    website_id UUID REFERENCES websites(id) ON DELETE SET NULL,
    
    action VARCHAR(100) NOT NULL,                  -- create, update, delete, deploy, etc.
    resource_type VARCHAR(50) NOT NULL,            -- website, user, domain, etc.
    resource_id UUID,                              -- ID of affected resource
    
    -- Details
    details JSONB,                                 -- Additional context
    ip_address INET,                               -- User IP
    user_agent TEXT,                               -- Browser info
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for logs
CREATE INDEX idx_logs_user ON activity_logs(user_id);
CREATE INDEX idx_logs_website ON activity_logs(website_id);
CREATE INDEX idx_logs_action ON activity_logs(action);
CREATE INDEX idx_logs_created ON activity_logs(created_at DESC);

-- ==========================================
-- SYSTEM SETTINGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT,
    value_type VARCHAR(50) DEFAULT 'string' CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
    description TEXT,
    is_editable BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by UUID REFERENCES users(id)
);

-- Default system settings
INSERT INTO system_settings (key, value, value_type, description, is_editable) VALUES
('platform_name', 'Universal Website Builder', 'string', 'Platform display name', true),
('max_websites_per_user', '10', 'number', 'Default maximum websites per user', true),
('default_cpu_limit', '0.5', 'number', 'Default CPU cores per website', true),
('default_memory_limit', '512', 'number', 'Default memory in MB per website', true),
('default_storage_limit', '1', 'number', 'Default storage in GB per website', true),
('auto_suspend_idle_days', '30', 'number', 'Days of inactivity before auto-suspend', true),
('maintenance_mode', 'false', 'boolean', 'Platform maintenance mode', true),
('registration_enabled', 'true', 'boolean', 'Allow new user registration', true)
ON CONFLICT (key) DO NOTHING;

-- ==========================================
-- FUNCTIONS AND TRIGGERS
-- ==========================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_websites_updated_at BEFORE UPDATE ON websites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_domains_updated_at BEFORE UPDATE ON domains
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to generate unique subdomain
CREATE OR REPLACE FUNCTION generate_subdomain()
RETURNS VARCHAR(63) AS $$
DECLARE
    new_subdomain VARCHAR(63);
    exists_check BOOLEAN;
BEGIN
    LOOP
        -- Generate random 8-character alphanumeric string
        new_subdomain := lower(substring(md5(random()::text), 1, 8));
        
        -- Check if exists
        SELECT EXISTS(SELECT 1 FROM websites WHERE subdomain = new_subdomain) INTO exists_check;
        
        EXIT WHEN NOT exists_check;
    END LOOP;
    
    RETURN new_subdomain;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- VIEWS
-- ==========================================

-- Website summary view
CREATE OR REPLACE VIEW website_summary AS
SELECT 
    w.id,
    w.name,
    w.subdomain,
    w.custom_domain,
    w.template_type,
    w.status,
    w.health_status,
    w.owner_id,
    u.email as owner_email,
    w.created_at,
    w.updated_at,
    w.last_deployed_at,
    w.deploy_count,
    (w.resource_config->>'cpu_limit')::decimal as cpu_limit,
    (w.resource_config->>'memory_limit')::integer as memory_limit,
    (w.resource_config->>'storage_limit')::integer as storage_limit
FROM websites w
JOIN users u ON w.owner_id = u.id
WHERE w.deleted_at IS NULL;

-- User quota usage view
CREATE OR REPLACE VIEW user_quota_usage AS
SELECT 
    u.id as user_id,
    u.email,
    u.quota_max_websites,
    u.quota_max_cpu,
    u.quota_max_memory,
    u.quota_max_storage,
    COUNT(w.id) as websites_count,
    COALESCE(SUM((w.resource_config->>'cpu_limit')::decimal), 0) as used_cpu,
    COALESCE(SUM((w.resource_config->>'memory_limit')::integer), 0) as used_memory,
    COALESCE(SUM((w.resource_config->>'storage_limit')::integer), 0) as used_storage
FROM users u
LEFT JOIN websites w ON u.id = w.owner_id AND w.deleted_at IS NULL AND w.status != 'deleted'
GROUP BY u.id, u.email, u.quota_max_websites, u.quota_max_cpu, u.quota_max_memory, u.quota_max_storage;

-- ==========================================
-- INITIAL DATA
-- ==========================================

-- Create default admin user (password: admin123 - CHANGE IN PRODUCTION!)
-- Password hash generated with bcrypt (10 rounds)
INSERT INTO users (email, password_hash, full_name, role, quota_max_websites, email_verified)
VALUES (
    'admin@uwbp.local',
    '$2b$10$YourHashHere',  -- Replace with actual bcrypt hash of 'admin123'
    'System Administrator',
    'admin',
    999999,
    true
)
ON CONFLICT (email) DO NOTHING;

-- ==========================================
-- COMMENTS
-- ==========================================

COMMENT ON TABLE users IS 'Platform users with authentication and quota information';
COMMENT ON TABLE websites IS 'Website instances with configuration and runtime status';
COMMENT ON TABLE website_deployments IS 'Deployment history and build logs for each website';
COMMENT ON TABLE domains IS 'Custom domain mappings with SSL certificate management';
COMMENT ON TABLE website_metrics IS 'Time-series resource usage metrics';
COMMENT ON TABLE activity_logs IS 'Audit trail of all user actions';
COMMENT ON TABLE system_settings IS 'Platform-wide configuration settings';
