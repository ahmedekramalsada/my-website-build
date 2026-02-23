/**
 * Platform Settings Routes
 * Manage system-wide configuration
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { asyncHandler, APIError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/settings
 * Get all system settings
 */
router.get('/', requirePermission('system.settings'), asyncHandler(async (req, res) => {
    const result = await db.query(`
        SELECT s.*, u.email as updated_by_email
        FROM system_settings s
        LEFT JOIN users u ON s.updated_by = u.id
        ORDER BY s.key
    `);

    // Convert to object for easier use
    const settings = {};
    for (const row of result.rows) {
        let value = row.value;

        // Convert based on type
        switch (row.value_type) {
            case 'number':
                value = parseFloat(value);
                break;
            case 'boolean':
                value = value === 'true';
                break;
            case 'json':
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    // Keep as string if parse fails
                }
                break;
        }

        settings[row.key] = {
            value,
            type: row.value_type,
            description: row.description,
            isEditable: row.is_editable,
            updatedAt: row.updated_at,
            updatedBy: row.updated_by_email
        };
    }

    res.json({ settings });
}));

/**
 * GET /api/settings/:key
 * Get a specific setting
 */
router.get('/:key', asyncHandler(async (req, res) => {
    const result = await db.query(`
        SELECT s.*, u.email as updated_by_email
        FROM system_settings s
        LEFT JOIN users u ON s.updated_by = u.id
        WHERE s.key = $1
    `, [req.params.key]);

    if (result.rows.length === 0) {
        throw new APIError('Setting not found', 404);
    }

    const row = result.rows[0];
    let value = row.value;

    switch (row.value_type) {
        case 'number':
            value = parseFloat(value);
            break;
        case 'boolean':
            value = value === 'true';
            break;
        case 'json':
            try {
                value = JSON.parse(value);
            } catch (e) {
                // Keep as string
            }
            break;
    }

    res.json({
        setting: {
            key: row.key,
            value,
            type: row.value_type,
            description: row.description,
            isEditable: row.is_editable,
            updatedAt: row.updated_at,
            updatedBy: row.updated_by_email
        }
    });
}));

/**
 * PUT /api/settings
 * Update multiple settings
 */
router.put('/', [
    body('settings').isObject()
], requirePermission('system.settings'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { settings } = req.body;
    const updated = [];

    for (const [key, value] of Object.entries(settings)) {
        // Get current setting to check type and editability
        const currentResult = await db.query(
            'SELECT * FROM system_settings WHERE key = $1',
            [key]
        );

        if (currentResult.rows.length === 0) {
            continue; // Skip non-existent settings
        }

        const current = currentResult.rows[0];

        if (!current.is_editable) {
            continue; // Skip non-editable settings
        }

        // Convert value to string based on type
        let stringValue;
        switch (current.value_type) {
            case 'boolean':
                stringValue = value ? 'true' : 'false';
                break;
            case 'number':
                stringValue = String(value);
                break;
            case 'json':
                stringValue = typeof value === 'string' ? value : JSON.stringify(value);
                break;
            default:
                stringValue = String(value);
        }

        await db.query(`
            UPDATE system_settings
            SET value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
            WHERE key = $3
        `, [stringValue, req.user.id, key]);

        updated.push(key);
    }

    logger.info(`Settings updated: ${updated.join(', ')} by user ${req.user.id}`);

    res.json({
        message: 'Settings updated successfully',
        updated
    });
}));

/**
 * PUT /api/settings/:key
 * Update a specific setting
 */
router.put('/:key', [
    body('value').exists()
], requirePermission('system.settings'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { key } = req.params;
    let { value } = req.body;

    // Get current setting
    const currentResult = await db.query(
        'SELECT * FROM system_settings WHERE key = $1',
        [key]
    );

    if (currentResult.rows.length === 0) {
        throw new APIError('Setting not found', 404);
    }

    const current = currentResult.rows[0];

    if (!current.is_editable) {
        throw new APIError('This setting is not editable', 403);
    }

    // Convert value to string based on type
    let stringValue;
    switch (current.value_type) {
        case 'boolean':
            stringValue = value ? 'true' : 'false';
            break;
        case 'number':
            stringValue = String(value);
            break;
        case 'json':
            stringValue = typeof value === 'string' ? value : JSON.stringify(value);
            break;
        default:
            stringValue = String(value);
    }

    await db.query(`
        UPDATE system_settings
        SET value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
        WHERE key = $3
    `, [stringValue, req.user.id, key]);

    logger.info(`Setting updated: ${key} by user ${req.user.id}`);

    res.json({
        message: 'Setting updated successfully',
        key,
        value
    });
}));

/**
 * POST /api/settings/reset
 * Reset settings to defaults
 */
router.post('/reset', requirePermission('system.settings'), asyncHandler(async (req, res) => {
    const defaults = [
        { key: 'platform_name', value: 'Universal Website Builder' },
        { key: 'max_websites_per_user', value: '10' },
        { key: 'default_cpu_limit', value: '0.5' },
        { key: 'default_memory_limit', value: '512' },
        { key: 'default_storage_limit', value: '1' },
        { key: 'auto_suspend_idle_days', value: '30' },
        { key: 'maintenance_mode', value: 'false' },
        { key: 'registration_enabled', value: 'true' }
    ];

    for (const setting of defaults) {
        await db.query(`
            UPDATE system_settings
            SET value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
            WHERE key = $3 AND is_editable = true
        `, [setting.value, req.user.id, setting.key]);
    }

    logger.info(`Settings reset to defaults by user ${req.user.id}`);

    res.json({
        message: 'Settings reset to defaults successfully'
    });
}));

/**
 * GET /api/settings/resource-limits
 * Get resource limit settings
 */
router.get('/resource-limits/defaults', asyncHandler(async (req, res) => {
    const result = await db.query(`
        SELECT key, value, value_type
        FROM system_settings
        WHERE key IN ('default_cpu_limit', 'default_memory_limit', 'default_storage_limit', 'max_websites_per_user')
    `);

    const limits = {};
    for (const row of result.rows) {
        limits[row.key] = row.value_type === 'number' ? parseFloat(row.value) : row.value;
    }

    res.json({ limits });
}));

module.exports = router;