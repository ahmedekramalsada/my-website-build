/**
 * Database Seed Script
 * Creates initial admin user, roles, and default data
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://uwbp:uwbp@localhost:5432/uwbp',
});

async function seed() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Get or create super_admin role
        let roleResult = await client.query(
            "SELECT id FROM roles WHERE name = 'super_admin'"
        );

        let superAdminRoleId;
        if (roleResult.rows.length === 0) {
            // Create super_admin role if it doesn't exist
            const createRoleResult = await client.query(`
                INSERT INTO roles (name, display_name, description, is_system, permissions)
                VALUES ('super_admin', 'Super Administrator', 'Full platform access with all permissions', true,
                    '["users.view", "users.create", "users.update", "users.delete", "users.manage_roles",
                      "websites.view", "websites.create", "websites.update", "websites.delete", "websites.deploy", "websites.manage_all",
                      "system.settings", "system.logs", "system.health", "system.maintenance",
                      "roles.view", "roles.create", "roles.update", "roles.delete",
                      "apikeys.view", "apikeys.create", "apikeys.delete",
                      "domains.view", "domains.create", "domains.delete", "domains.manage_ssl",
                      "deployments.view", "deployments.rollback"]'::jsonb)
                RETURNING id
            `);
            superAdminRoleId = createRoleResult.rows[0].id;
            console.log('✅ Created super_admin role');
        } else {
            superAdminRoleId = roleResult.rows[0].id;
        }

        // Create admin user
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@uwbp.local';
        const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!'; // Updated default password
        const passwordHash = await bcrypt.hash(adminPassword, 12);

        const adminResult = await client.query(
            `INSERT INTO users (email, password_hash, full_name, role, is_active, email_verified, 
                quota_max_websites, quota_max_cpu, quota_max_memory, quota_max_storage)
            VALUES ($1, $2, $3, 'admin', true, true, 999999, 99.99, 102400, 1000)
            ON CONFLICT (email) DO UPDATE 
            SET role = 'admin', is_active = true, email_verified = true, password_hash = EXCLUDED.password_hash
            RETURNING id, email, full_name, role`,
            [adminEmail, passwordHash, 'System Administrator']
        );

        const adminUser = adminResult.rows[0];
        console.log('✅ Admin user created/updated:', {
            id: adminUser.id,
            email: adminUser.email,
            full_name: adminUser.full_name,
            role: adminUser.role
        });

        // Assign super_admin role to admin user
        await client.query(
            `INSERT INTO user_roles (user_id, role_id, assigned_by)
             VALUES ($1, $2, $1)
             ON CONFLICT (user_id, role_id) DO NOTHING`,
            [adminUser.id, superAdminRoleId]
        );
        console.log('✅ Super admin role assigned to admin user');

        // Create default system settings
        const settings = [
            { key: 'platform_name', value: 'Universal Website Builder', type: 'string', desc: 'Platform display name' },
            { key: 'max_websites_per_user', value: '10', type: 'number', desc: 'Default maximum websites per user' },
            { key: 'default_cpu_limit', value: '0.5', type: 'number', desc: 'Default CPU cores per website' },
            { key: 'default_memory_limit', value: '512', type: 'number', desc: 'Default memory in MB per website' },
            { key: 'default_storage_limit', value: '1', type: 'number', desc: 'Default storage in GB per website' },
            { key: 'auto_suspend_idle_days', value: '30', type: 'number', desc: 'Days of inactivity before auto-suspend' },
            { key: 'maintenance_mode', value: 'false', type: 'boolean', desc: 'Platform maintenance mode' },
            { key: 'registration_enabled', value: 'true', type: 'boolean', desc: 'Allow new user registration' },
        ];

        for (const setting of settings) {
            await client.query(
                `INSERT INTO system_settings (key, value, value_type, description, is_editable)
             VALUES ($1, $2, $3, $4, true)
             ON CONFLICT (key) DO NOTHING`,
                [setting.key, setting.value, setting.type, setting.desc]
            );
        }

        console.log('✅ System settings seeded');

        await client.query('COMMIT');
        console.log('\n🎉 Database seeded successfully!');
        console.log('\n📋 Admin Credentials:');
        console.log(`   Email: ${adminEmail}`);
        console.log(`   Password: ${adminPassword}`);
        console.log('\n⚠️  Please change the admin password after first login!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Seed failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(console.error);
