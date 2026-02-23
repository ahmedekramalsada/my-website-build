/**
 * Role Management Routes
 * CRUD operations for roles and permission management
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permissions');
const { asyncHandler, APIError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/roles
 * List all roles with user counts
 */
router.get('/', requirePermission('roles.view'), asyncHandler(async (req, res) => {
    const result = await db.query(`
        SELECT r.*, 
               COUNT(ur.user_id) as user_count
        FROM roles r
        LEFT JOIN user_roles ur ON r.id = ur.role_id
        GROUP BY r.id
        ORDER BY r.is_system DESC, r.name ASC
    `);

    res.json({
        roles: result.rows
    });
}));

/**
 * GET /api/roles/permissions
 * List all available permissions
 */
router.get('/permissions', requirePermission('roles.view'), asyncHandler(async (req, res) => {
    const result = await db.query(`
        SELECT * FROM permissions
        ORDER BY category, name
    `);

    // Group by category
    const grouped = {};
    for (const perm of result.rows) {
        if (!grouped[perm.category]) {
            grouped[perm.category] = [];
        }
        grouped[perm.category].push(perm);
    }

    res.json({
        permissions: result.rows,
        grouped
    });
}));

/**
 * GET /api/roles/:id
 * Get role details with users
 */
router.get('/:id', requirePermission('roles.view'), asyncHandler(async (req, res) => {
    const roleResult = await db.query(
        'SELECT * FROM roles WHERE id = $1',
        [req.params.id]
    );

    if (roleResult.rows.length === 0) {
        throw new APIError('Role not found', 404);
    }

    const role = roleResult.rows[0];

    // Get users with this role
    const usersResult = await db.query(`
        SELECT u.id, u.email, u.full_name, ur.assigned_at, ur.assigned_by,
               assigner.email as assigned_by_email
        FROM user_roles ur
        JOIN users u ON ur.user_id = u.id
        LEFT JOIN users assigner ON ur.assigned_by = assigner.id
        WHERE ur.role_id = $1
        ORDER BY ur.assigned_at DESC
        LIMIT 50
    `, [req.params.id]);

    res.json({
        role,
        users: usersResult.rows
    });
}));

/**
 * POST /api/roles
 * Create a new role
 */
router.post('/', [
    body('name').trim().isLength({ min: 2, max: 50 }).matches(/^[a-z0-9_]+$/),
    body('displayName').trim().isLength({ min: 2, max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('permissions').isArray()
], requirePermission('roles.create'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { name, displayName, description, permissions } = req.body;

    // Check if role name already exists
    const existingResult = await db.query(
        'SELECT id FROM roles WHERE name = $1',
        [name]
    );

    if (existingResult.rows.length > 0) {
        throw new APIError('Role name already exists', 409);
    }

    // Validate permissions exist
    if (permissions.length > 0) {
        const permResult = await db.query(
            'SELECT name FROM permissions WHERE name = ANY($1)',
            [permissions]
        );

        if (permResult.rows.length !== permissions.length) {
            throw new APIError('Some permissions are invalid', 400);
        }
    }

    const result = await db.query(`
        INSERT INTO roles (name, display_name, description, permissions, is_system)
        VALUES ($1, $2, $3, $4, false)
        RETURNING *
    `, [name, displayName, description || null, JSON.stringify(permissions)]);

    logger.info(`Role created: ${name} by user ${req.user.id}`);

    res.status(201).json({
        message: 'Role created successfully',
        role: result.rows[0]
    });
}));

/**
 * PUT /api/roles/:id
 * Update a role
 */
router.put('/:id', [
    body('displayName').optional().trim().isLength({ min: 2, max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('permissions').optional().isArray()
], requirePermission('roles.update'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { displayName, description, permissions } = req.body;

    // Check role exists and is not system role
    const checkResult = await db.query(
        'SELECT * FROM roles WHERE id = $1',
        [req.params.id]
    );

    if (checkResult.rows.length === 0) {
        throw new APIError('Role not found', 404);
    }

    const role = checkResult.rows[0];

    if (role.is_system) {
        throw new APIError('Cannot modify system roles', 403);
    }

    // Validate permissions if provided
    if (permissions && permissions.length > 0) {
        const permResult = await db.query(
            'SELECT name FROM permissions WHERE name = ANY($1)',
            [permissions]
        );

        if (permResult.rows.length !== permissions.length) {
            throw new APIError('Some permissions are invalid', 400);
        }
    }

    // Build update query
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (displayName !== undefined) {
        updates.push(`display_name = $${paramIndex++}`);
        values.push(displayName);
    }
    if (description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(description);
    }
    if (permissions !== undefined) {
        updates.push(`permissions = $${paramIndex++}`);
        values.push(JSON.stringify(permissions));
    }

    if (updates.length === 0) {
        throw new APIError('No fields to update', 400);
    }

    values.push(req.params.id);

    const result = await db.query(`
        UPDATE roles
        SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING *
    `, values);

    logger.info(`Role updated: ${role.name} by user ${req.user.id}`);

    res.json({
        message: 'Role updated successfully',
        role: result.rows[0]
    });
}));

/**
 * DELETE /api/roles/:id
 * Delete a role (non-system only)
 */
router.delete('/:id', requirePermission('roles.delete'), asyncHandler(async (req, res) => {
    // Check role exists and is not system role
    const checkResult = await db.query(
        'SELECT * FROM roles WHERE id = $1',
        [req.params.id]
    );

    if (checkResult.rows.length === 0) {
        throw new APIError('Role not found', 404);
    }

    const role = checkResult.rows[0];

    if (role.is_system) {
        throw new APIError('Cannot delete system roles', 403);
    }

    // Check if any users have this role
    const usersCount = await db.query(
        'SELECT COUNT(*) FROM user_roles WHERE role_id = $1',
        [req.params.id]
    );

    if (parseInt(usersCount.rows[0].count) > 0) {
        throw new APIError('Cannot delete role with assigned users. Remove users first.', 400);
    }

    await db.query('DELETE FROM roles WHERE id = $1', [req.params.id]);

    logger.info(`Role deleted: ${role.name} by user ${req.user.id}`);

    res.json({ message: 'Role deleted successfully' });
}));

/**
 * POST /api/roles/:id/users
 * Assign role to user
 */
router.post('/:id/users', [
    body('userId').isUUID()
], requirePermission('users.manage_roles'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { userId } = req.body;
    const roleId = req.params.id;

    // Check role exists
    const roleResult = await db.query('SELECT * FROM roles WHERE id = $1', [roleId]);
    if (roleResult.rows.length === 0) {
        throw new APIError('Role not found', 404);
    }

    // Check user exists
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
        throw new APIError('User not found', 404);
    }

    // Assign role
    await db.query(`
        INSERT INTO user_roles (user_id, role_id, assigned_by)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, role_id) DO NOTHING
    `, [userId, roleId, req.user.id]);

    logger.info(`Role ${roleResult.rows[0].name} assigned to user ${userId} by ${req.user.id}`);

    res.json({
        message: 'Role assigned successfully'
    });
}));

/**
 * DELETE /api/roles/:id/users/:userId
 * Remove role from user
 */
router.delete('/:id/users/:userId', requirePermission('users.manage_roles'), asyncHandler(async (req, res) => {
    const { id: roleId, userId } = req.params;

    // Check if this is the last admin role
    const roleResult = await db.query('SELECT name FROM roles WHERE id = $1', [roleId]);
    if (roleResult.rows.length > 0 && roleResult.rows[0].name === 'super_admin') {
        // Count super_admin roles for this user
        const adminCount = await db.query(`
            SELECT COUNT(*) FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = $1 AND r.name = 'super_admin'
        `, [userId]);

        if (parseInt(adminCount.rows[0].count) <= 1) {
            // Check if this is the last super_admin overall
            const totalAdminCount = await db.query(`
                SELECT COUNT(DISTINCT ur.user_id) FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                WHERE r.name = 'super_admin'
            `);

            if (parseInt(totalAdminCount.rows[0].count) <= 1) {
                throw new APIError('Cannot remove the last super admin role', 400);
            }
        }
    }

    await db.query(
        'DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2',
        [userId, roleId]
    );

    logger.info(`Role ${roleId} removed from user ${userId} by ${req.user.id}`);

    res.json({ message: 'Role removed successfully' });
}));

module.exports = router;