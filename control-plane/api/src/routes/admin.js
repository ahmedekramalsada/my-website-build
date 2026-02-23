/**
 * Admin Routes - Enhanced User and Website Management
 * Full control over users, websites, and platform
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requirePermission, getUserPermissions, getUserRoles, assignRoleToUser, removeRoleFromUser } = require('../middleware/permissions');
const { asyncHandler, APIError } = require('../middleware/errorHandler');
const dockerService = require('../services/dockerService');
const logger = require('../utils/logger');

const router = express.Router();

// All admin routes require authentication
router.use(authenticate);

/**
 * GET /api/admin/users
 * List all users with pagination and search
 */
router.get('/users', [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('search').optional().trim(),
    query('role').optional().trim(),
    query('status').optional().isIn(['active', 'inactive'])
], requirePermission('users.view'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { limit = 20, offset = 0, search, role, status } = req.query;

    let query = `
        SELECT u.*,
            COUNT(DISTINCT w.id) as website_count,
            COALESCE(SUM((w.resource_config->>'cpu_limit')::decimal), 0) as total_cpu,
            COALESCE(SUM((w.resource_config->>'memory_limit')::integer), 0) as total_memory,
            COALESCE(
                (SELECT json_agg(json_build_object('id', r.id, 'name', r.name, 'display_name', r.display_name))
                 FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = u.id),
                '[]'::json
            ) as roles
        FROM users u
        LEFT JOIN websites w ON u.id = w.owner_id AND w.deleted_at IS NULL
        WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (search) {
        query += ` AND (u.email ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
    }

    if (status === 'active') {
        query += ` AND u.is_active = true`;
    } else if (status === 'inactive') {
        query += ` AND u.is_active = false`;
    }

    if (role) {
        query += ` AND EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = u.id AND r.name = $${paramIndex}
        )`;
        params.push(role);
        paramIndex++;
    }

    query += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    const countResult = await db.query('SELECT COUNT(*) FROM users');

    res.json({
        users: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit,
        offset,
    });
}));

/**
 * POST /api/admin/users
 * Create a new user (admin can create users with specific roles)
 */
router.post('/users', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('fullName').optional().trim().isLength({ max: 255 }),
    body('roleIds').optional().isArray(),
    body('sendInvite').optional().isBoolean()
], requirePermission('users.create'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { email, password, fullName, roleIds, sendInvite } = req.body;

    // Check if email exists
    const existingResult = await db.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
    );

    if (existingResult.rows.length > 0) {
        throw new APIError('Email already registered', 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await db.query(`
        INSERT INTO users (email, password_hash, full_name, is_active, email_verified)
        VALUES ($1, $2, $3, true, true)
        RETURNING id, email, full_name, created_at
    `, [email, passwordHash, fullName || null]);

    const user = result.rows[0];

    // Assign roles
    if (roleIds && roleIds.length > 0) {
        for (const roleId of roleIds) {
            await assignRoleToUser(user.id, roleId, req.user.id);
        }
    } else {
        // Assign default 'user' role
        const defaultRoleResult = await db.query(
            "SELECT id FROM roles WHERE name = 'user'"
        );
        if (defaultRoleResult.rows.length > 0) {
            await assignRoleToUser(user.id, defaultRoleResult.rows[0].id, req.user.id);
        }
    }

    // Log activity
    await logActivity(req.user.id, null, 'user.create', 'user', user.id, { email });

    logger.info(`Admin created user: ${email} by ${req.user.id}`);

    res.status(201).json({
        message: 'User created successfully',
        user
    });
}));

/**
 * GET /api/admin/users/:id
 * Get user details with roles and websites
 */
router.get('/users/:id', requirePermission('users.view'), asyncHandler(async (req, res) => {
    const result = await db.query(`
        SELECT u.*,
            COUNT(DISTINCT w.id) as website_count,
            COALESCE(
                (SELECT json_agg(json_build_object('id', r.id, 'name', r.name, 'display_name', r.display_name, 'assigned_at', ur.assigned_at))
                 FROM user_roles ur JOIN roles r ON ur.role_id = r.id WHERE ur.user_id = u.id),
                '[]'::json
            ) as roles
        FROM users u
        LEFT JOIN websites w ON u.id = w.owner_id AND w.deleted_at IS NULL
        WHERE u.id = $1
        GROUP BY u.id
    `, [req.params.id]);

    if (result.rows.length === 0) {
        throw new APIError('User not found', 404);
    }

    // Get user's websites
    const websitesResult = await db.query(`
        SELECT id, name, subdomain, template_type, status, created_at
        FROM websites
        WHERE owner_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 20
    `, [req.params.id]);

    res.json({
        user: result.rows[0],
        websites: websitesResult.rows
    });
}));

/**
 * PUT /api/admin/users/:id
 * Update user (quota, status, etc.)
 */
router.put('/users/:id', [
    body('quotaMaxWebsites').optional().isInt({ min: 0 }),
    body('quotaMaxCpu').optional().isFloat({ min: 0, max: 99.99 }),
    body('quotaMaxMemory').optional().isInt({ min: 0 }),
    body('quotaMaxStorage').optional().isInt({ min: 0 }),
    body('isActive').optional().isBoolean(),
    body('fullName').optional().trim().isLength({ max: 255 }),
    body('email').optional().isEmail().normalizeEmail()
], requirePermission('users.update'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const allowedFields = [
        'quotaMaxWebsites', 'quotaMaxCpu', 'quotaMaxMemory', 'quotaMaxStorage',
        'isActive', 'fullName', 'email'
    ];

    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(req.body)) {
        if (allowedFields.includes(key)) {
            const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
            updates.push(`${dbField} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        }
    }

    if (updates.length === 0) {
        throw new APIError('No valid fields to update', 400);
    }

    values.push(req.params.id);
    const query = `
        UPDATE users
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING id, email, full_name, is_active, quota_max_websites, quota_max_cpu, quota_max_memory, quota_max_storage
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
        throw new APIError('User not found', 404);
    }

    // Log activity
    await logActivity(req.user.id, null, 'user.update', 'user', req.params.id, req.body);

    logger.info(`Admin updated user ${req.params.id}`);

    res.json({
        message: 'User updated successfully',
        user: result.rows[0],
    });
}));

/**
 * POST /api/admin/users/:id/roles
 * Assign roles to user
 */
router.post('/users/:id/roles', [
    body('roleIds').isArray({ min: 1 })
], requirePermission('users.manage_roles'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { roleIds } = req.body;

    // Check user exists
    const userResult = await db.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (userResult.rows.length === 0) {
        throw new APIError('User not found', 404);
    }

    // Assign roles
    for (const roleId of roleIds) {
        await assignRoleToUser(req.params.id, roleId, req.user.id);
    }

    // Log activity
    await logActivity(req.user.id, null, 'user.roles_assigned', 'user', req.params.id, { roleIds });

    res.json({ message: 'Roles assigned successfully' });
}));

/**
 * DELETE /api/admin/users/:id/roles/:roleId
 * Remove role from user
 */
router.delete('/users/:id/roles/:roleId', requirePermission('users.manage_roles'), asyncHandler(async (req, res) => {
    await removeRoleFromUser(req.params.id, req.params.roleId);

    // Log activity
    await logActivity(req.user.id, null, 'user.role_removed', 'user', req.params.id, { roleId: req.params.roleId });

    res.json({ message: 'Role removed successfully' });
}));

/**
 * DELETE /api/admin/users/:id
 * Delete user and all their websites
 */
router.delete('/users/:id', requirePermission('users.delete'), asyncHandler(async (req, res) => {
    // Get user's websites
    const websitesResult = await db.query(
        'SELECT subdomain FROM websites WHERE owner_id = $1 AND deleted_at IS NULL',
        [req.params.id]
    );

    // Stop and remove all containers
    for (const website of websitesResult.rows) {
        try {
            await dockerService.removeContainer(`website-${website.subdomain}`);
        } catch (err) {
            logger.warn(`Failed to remove container for ${website.subdomain}: ${err.message}`);
        }
    }

    // Log activity before deletion
    await logActivity(req.user.id, null, 'user.delete', 'user', req.params.id);

    // Delete user (cascade will delete websites)
    await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);

    logger.info(`Admin deleted user ${req.params.id}`);

    res.json({ message: 'User deleted successfully' });
}));

/**
 * POST /api/admin/users/bulk
 * Bulk operations on users
 */
router.post('/users/bulk', [
    body('userIds').isArray({ min: 1 }),
    body('action').isIn(['activate', 'deactivate', 'delete'])
], requirePermission('users.update'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { userIds, action } = req.body;
    const results = { success: 0, failed: 0 };

    for (const userId of userIds) {
        try {
            switch (action) {
                case 'activate':
                    await db.query('UPDATE users SET is_active = true WHERE id = $1', [userId]);
                    results.success++;
                    break;
                case 'deactivate':
                    await db.query('UPDATE users SET is_active = false WHERE id = $1', [userId]);
                    results.success++;
                    break;
                case 'delete':
                    // Get websites and remove containers
                    const websites = await db.query(
                        'SELECT subdomain FROM websites WHERE owner_id = $1 AND deleted_at IS NULL',
                        [userId]
                    );
                    for (const w of websites.rows) {
                        try {
                            await dockerService.removeContainer(`website-${w.subdomain}`);
                        } catch (e) { /* ignore */ }
                    }
                    await db.query('DELETE FROM users WHERE id = $1', [userId]);
                    results.success++;
                    break;
            }
        } catch (err) {
            results.failed++;
        }
    }

    // Log activity
    await logActivity(req.user.id, null, `users.bulk_${action}`, 'user', null, { count: userIds.length });

    res.json({
        message: `Bulk ${action} completed`,
        results
    });
}));

/**
 * GET /api/admin/websites
 * List all websites with pagination
 */
router.get('/websites', [
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('status').optional().isIn(['pending', 'deploying', 'running', 'stopped', 'error']),
    query('search').optional().trim(),
    query('userId').optional().isUUID()
], requirePermission('websites.view'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { limit = 20, offset = 0, status, search, userId } = req.query;

    let query = `
        SELECT w.*, u.email as owner_email, u.full_name as owner_name
        FROM websites w
        JOIN users u ON w.owner_id = u.id
        WHERE w.deleted_at IS NULL
    `;

    const params = [];

    if (status) {
        params.push(status);
        query += ` AND w.status = $${params.length}`;
    }

    if (userId) {
        params.push(userId);
        query += ` AND w.owner_id = $${params.length}`;
    }

    if (search) {
        params.push(`%${search}%`);
        query += ` AND (w.name ILIKE $${params.length} OR w.subdomain ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
    }

    query += ` ORDER BY w.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Get total count
    const countResult = await db.query('SELECT COUNT(*) FROM websites WHERE deleted_at IS NULL');

    res.json({
        websites: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit,
        offset,
    });
}));

/**
 * POST /api/admin/websites/:id/deploy
 * Force deploy a website
 */
router.post('/websites/:id/deploy', requirePermission('websites.deploy'), asyncHandler(async (req, res) => {
    const websiteResult = await db.query(
        'SELECT * FROM websites WHERE id = $1 AND deleted_at IS NULL',
        [req.params.id]
    );

    if (websiteResult.rows.length === 0) {
        throw new APIError('Website not found', 404);
    }

    const website = websiteResult.rows[0];

    // Create container
    const containerInfo = await dockerService.createContainer(website);

    // Update website status
    await db.query(
        "UPDATE websites SET status = 'running', last_deployed_at = CURRENT_TIMESTAMP WHERE id = $1",
        [req.params.id]
    );

    // Log activity
    await logActivity(req.user.id, req.params.id, 'website.deploy', 'website', req.params.id);

    logger.info(`Admin deployed website ${req.params.id}`);

    res.json({
        message: 'Website deployed successfully',
        containerId: containerInfo.containerId,
        status: 'running',
    });
}));

/**
 * POST /api/admin/websites/:id/stop
 * Force stop a website
 */
router.post('/websites/:id/stop', requirePermission('websites.deploy'), asyncHandler(async (req, res) => {
    const websiteResult = await db.query(
        'SELECT subdomain FROM websites WHERE id = $1 AND deleted_at IS NULL',
        [req.params.id]
    );

    if (websiteResult.rows.length === 0) {
        throw new APIError('Website not found', 404);
    }

    const { subdomain } = websiteResult.rows[0];
    await dockerService.stopContainer(`website-${subdomain}`);

    await db.query(
        "UPDATE websites SET status = 'stopped' WHERE id = $1",
        [req.params.id]
    );

    // Log activity
    await logActivity(req.user.id, req.params.id, 'website.stop', 'website', req.params.id);

    logger.info(`Admin stopped website ${req.params.id}`);

    res.json({ message: 'Website stopped successfully' });
}));

/**
 * POST /api/admin/websites/:id/restart
 * Restart a website
 */
router.post('/websites/:id/restart', requirePermission('websites.deploy'), asyncHandler(async (req, res) => {
    const websiteResult = await db.query(
        'SELECT subdomain FROM websites WHERE id = $1 AND deleted_at IS NULL',
        [req.params.id]
    );

    if (websiteResult.rows.length === 0) {
        throw new APIError('Website not found', 404);
    }

    const { subdomain } = websiteResult.rows[0];
    await dockerService.restartContainer(`website-${subdomain}`);

    // Log activity
    await logActivity(req.user.id, req.params.id, 'website.restart', 'website', req.params.id);

    res.json({ message: 'Website restarted successfully' });
}));

/**
 * DELETE /api/admin/websites/:id
 * Force delete a website
 */
router.delete('/websites/:id', requirePermission('websites.delete'), asyncHandler(async (req, res) => {
    const websiteResult = await db.query(
        'SELECT subdomain FROM websites WHERE id = $1',
        [req.params.id]
    );

    if (websiteResult.rows.length === 0) {
        throw new APIError('Website not found', 404);
    }

    const { subdomain } = websiteResult.rows[0];

    // Remove container
    try {
        await dockerService.removeContainer(`website-${subdomain}`);
    } catch (err) {
        logger.warn(`Failed to remove container: ${err.message}`);
    }

    // Hard delete
    await db.query('DELETE FROM websites WHERE id = $1', [req.params.id]);

    // Log activity
    await logActivity(req.user.id, req.params.id, 'website.delete', 'website', req.params.id);

    logger.info(`Admin deleted website ${req.params.id}`);

    res.json({ message: 'Website deleted successfully' });
}));

/**
 * POST /api/admin/websites/bulk
 * Bulk operations on websites
 */
router.post('/websites/bulk', [
    body('websiteIds').isArray({ min: 1 }),
    body('action').isIn(['start', 'stop', 'restart', 'delete'])
], requirePermission('websites.manage_all'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { websiteIds, action } = req.body;
    const results = { success: 0, failed: 0 };

    for (const websiteId of websiteIds) {
        try {
            const website = await db.query(
                'SELECT subdomain FROM websites WHERE id = $1 AND deleted_at IS NULL',
                [websiteId]
            );

            if (website.rows.length === 0) continue;

            const { subdomain } = website.rows[0];
            const containerName = `website-${subdomain}`;

            switch (action) {
                case 'start':
                    await dockerService.startContainer(containerName);
                    await db.query("UPDATE websites SET status = 'running' WHERE id = $1", [websiteId]);
                    results.success++;
                    break;
                case 'stop':
                    await dockerService.stopContainer(containerName);
                    await db.query("UPDATE websites SET status = 'stopped' WHERE id = $1", [websiteId]);
                    results.success++;
                    break;
                case 'restart':
                    await dockerService.restartContainer(containerName);
                    results.success++;
                    break;
                case 'delete':
                    await dockerService.removeContainer(containerName);
                    await db.query('DELETE FROM websites WHERE id = $1', [websiteId]);
                    results.success++;
                    break;
            }
        } catch (err) {
            results.failed++;
        }
    }

    // Log activity
    await logActivity(req.user.id, null, `websites.bulk_${action}`, 'website', null, { count: websiteIds.length });

    res.json({
        message: `Bulk ${action} completed`,
        results
    });
}));

/**
 * GET /api/admin/stats
 * Get platform statistics
 */
router.get('/stats', requirePermission('system.health'), asyncHandler(async (req, res) => {
    const usersCount = await db.query('SELECT COUNT(*) FROM users');
    const activeUsersCount = await db.query('SELECT COUNT(*) FROM users WHERE is_active = true');
    const websitesCount = await db.query('SELECT COUNT(*) FROM websites WHERE deleted_at IS NULL');
    const runningCount = await db.query("SELECT COUNT(*) FROM websites WHERE status = 'running' AND deleted_at IS NULL");
    const stoppedCount = await db.query("SELECT COUNT(*) FROM websites WHERE status = 'stopped' AND deleted_at IS NULL");
    const pendingCount = await db.query("SELECT COUNT(*) FROM websites WHERE status = 'pending' AND deleted_at IS NULL");
    const errorCount = await db.query("SELECT COUNT(*) FROM websites WHERE status = 'error' AND deleted_at IS NULL");

    // Get containers
    const containers = await dockerService.listWebsiteContainers();

    // Get resource usage
    const resourceUsage = await db.query(`
        SELECT 
            COALESCE(SUM((resource_config->>'cpu_limit')::decimal), 0) as total_cpu,
            COALESCE(SUM((resource_config->>'memory_limit')::integer), 0) as total_memory,
            COALESCE(SUM((resource_config->>'storage_limit')::integer), 0) as total_storage
        FROM websites WHERE deleted_at IS NULL AND status = 'running'
    `);

    res.json({
        users: {
            total: parseInt(usersCount.rows[0].count),
            active: parseInt(activeUsersCount.rows[0].count),
        },
        websites: {
            total: parseInt(websitesCount.rows[0].count),
            running: parseInt(runningCount.rows[0].count),
            stopped: parseInt(stoppedCount.rows[0].count),
            pending: parseInt(pendingCount.rows[0].count),
            error: parseInt(errorCount.rows[0].count),
        },
        containers: {
            running: containers.filter(c => c.State === 'running').length,
            total: containers.length,
        },
        resources: resourceUsage.rows[0],
    });
}));

/**
 * Helper function to log activity
 */
async function logActivity(userId, websiteId, action, resourceType, resourceId, details = null) {
    try {
        await db.query(`
            INSERT INTO activity_logs (user_id, website_id, action, resource_type, resource_id, details)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [userId, websiteId, action, resourceType, resourceId, details ? JSON.stringify(details) : null]);
    } catch (error) {
        logger.error('Failed to log activity:', error);
    }
}

module.exports = router;
