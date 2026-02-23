/**
 * API Key Management Routes
 * Create, list, and revoke API keys
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requirePermission, requireOwnershipOrPermission } = require('../middleware/permissions');
const { asyncHandler, APIError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * Generate a secure API key
 */
function generateApiKey() {
    // Generate 32 bytes of random data and convert to hex
    const key = crypto.randomBytes(32).toString('hex');
    // Add prefix for identification
    return `uwbp_${key}`;
}

/**
 * GET /api/api-keys
 * List user's API keys (or all for admin)
 */
router.get('/', [
    query('userId').optional().isUUID()
], requirePermission('apikeys.view'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { userId } = req.query;

    // Non-admins can only see their own keys
    const targetUserId = userId && req.user.role === 'admin' ? userId : req.user.id;

    const result = await db.query(`
        SELECT id, name, key_prefix, permissions, last_used_at, expires_at, is_active, created_at
        FROM api_keys
        WHERE user_id = $1
        ORDER BY created_at DESC
    `, [targetUserId]);

    res.json({
        keys: result.rows
    });
}));

/**
 * POST /api/api-keys
 * Create a new API key
 */
router.post('/', [
    body('name').trim().isLength({ min: 1, max: 100 }),
    body('permissions').optional().isArray(),
    body('expiresInDays').optional().isInt({ min: 1, max: 365 })
], requirePermission('apikeys.create'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { name, permissions = [], expiresInDays } = req.body;

    // Generate API key
    const apiKey = generateApiKey();
    const keyPrefix = apiKey.substring(0, 12);
    const keyHash = await bcrypt.hash(apiKey, 12);

    // Calculate expiration
    let expiresAt = null;
    if (expiresInDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // Validate permissions if provided
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
        INSERT INTO api_keys (user_id, name, key_hash, key_prefix, permissions, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, key_prefix, permissions, expires_at, created_at
    `, [req.user.id, name, keyHash, keyPrefix, JSON.stringify(permissions), expiresAt]);

    logger.info(`API key created: ${name} for user ${req.user.id}`);

    // Return the full key only once
    res.status(201).json({
        message: 'API key created successfully',
        key: {
            ...result.rows[0],
            // Full key is only shown once
            fullKey: apiKey
        },
        warning: 'Store this key securely. It will not be shown again.'
    });
}));

/**
 * DELETE /api/api-keys/:id
 * Revoke an API key
 */
router.delete('/:id', requirePermission('apikeys.delete'), asyncHandler(async (req, res) => {
    // Check if key exists and belongs to user (or user is admin)
    const keyResult = await db.query(
        'SELECT * FROM api_keys WHERE id = $1',
        [req.params.id]
    );

    if (keyResult.rows.length === 0) {
        throw new APIError('API key not found', 404);
    }

    const key = keyResult.rows[0];

    // Check ownership (unless admin)
    if (key.user_id !== req.user.id && req.user.role !== 'admin') {
        throw new APIError('You do not have permission to revoke this key', 403);
    }

    await db.query('DELETE FROM api_keys WHERE id = $1', [req.params.id]);

    logger.info(`API key revoked: ${key.name} (${key.key_prefix}) by user ${req.user.id}`);

    res.json({ message: 'API key revoked successfully' });
}));

/**
 * PUT /api/api-keys/:id
 * Update API key (name, permissions)
 */
router.put('/:id', [
    body('name').optional().trim().isLength({ min: 1, max: 100 }),
    body('permissions').optional().isArray(),
    body('isActive').optional().isBoolean()
], requirePermission('apikeys.create'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { name, permissions, isActive } = req.body;

    // Check if key exists and belongs to user (or user is admin)
    const keyResult = await db.query(
        'SELECT * FROM api_keys WHERE id = $1',
        [req.params.id]
    );

    if (keyResult.rows.length === 0) {
        throw new APIError('API key not found', 404);
    }

    const key = keyResult.rows[0];

    if (key.user_id !== req.user.id && req.user.role !== 'admin') {
        throw new APIError('You do not have permission to update this key', 403);
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

    if (name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(name);
    }
    if (permissions !== undefined) {
        updates.push(`permissions = $${paramIndex++}`);
        values.push(JSON.stringify(permissions));
    }
    if (isActive !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(isActive);
    }

    if (updates.length === 0) {
        throw new APIError('No fields to update', 400);
    }

    values.push(req.params.id);

    const result = await db.query(`
        UPDATE api_keys
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, name, key_prefix, permissions, is_active, expires_at
    `, values);

    res.json({
        message: 'API key updated successfully',
        key: result.rows[0]
    });
}));

/**
 * POST /api/api-keys/:id/regenerate
 * Regenerate an API key (creates new key, old key stops working)
 */
router.post('/:id/regenerate', requirePermission('apikeys.create'), asyncHandler(async (req, res) => {
    // Check if key exists and belongs to user (or user is admin)
    const keyResult = await db.query(
        'SELECT * FROM api_keys WHERE id = $1',
        [req.params.id]
    );

    if (keyResult.rows.length === 0) {
        throw new APIError('API key not found', 404);
    }

    const key = keyResult.rows[0];

    if (key.user_id !== req.user.id && req.user.role !== 'admin') {
        throw new APIError('You do not have permission to regenerate this key', 403);
    }

    // Generate new key
    const apiKey = generateApiKey();
    const keyPrefix = apiKey.substring(0, 12);
    const keyHash = await bcrypt.hash(apiKey, 12);

    const result = await db.query(`
        UPDATE api_keys
        SET key_hash = $1, key_prefix = $2, last_used_at = NULL
        WHERE id = $3
        RETURNING id, name, key_prefix, permissions, expires_at
    `, [keyHash, keyPrefix, req.params.id]);

    logger.info(`API key regenerated: ${key.name} for user ${req.user.id}`);

    res.json({
        message: 'API key regenerated successfully',
        key: {
            ...result.rows[0],
            fullKey: apiKey
        },
        warning: 'Store this key securely. The old key is no longer valid.'
    });
}));

/**
 * GET /api/api-keys/stats
 * Get API key usage statistics
 */
router.get('/stats', requirePermission('apikeys.view'), asyncHandler(async (req, res) => {
    const result = await db.query(`
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE is_active = true) as active,
            COUNT(*) FILTER (WHERE is_active = false) as inactive,
            COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW()) as expired,
            COUNT(*) FILTER (WHERE last_used_at > NOW() - INTERVAL '24 hours') as used_today,
            COUNT(*) FILTER (WHERE last_used_at > NOW() - INTERVAL '7 days') as used_this_week
        FROM api_keys
        WHERE user_id = $1
    `, [req.user.id]);

    res.json({ stats: result.rows[0] });
}));

module.exports = router;