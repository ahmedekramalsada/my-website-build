/**
 * Activity Logs Routes
 * View and export audit logs
 */

const express = require('express');
const { query, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { asyncHandler, APIError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/logs
 * Get activity logs with filtering
 */
router.get('/', [
    query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt(),
    query('userId').optional().isUUID(),
    query('websiteId').optional().isUUID(),
    query('action').optional().trim(),
    query('resourceType').optional().trim(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
], requirePermission('system.logs'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const {
        limit = 50,
        offset = 0,
        userId,
        websiteId,
        action,
        resourceType,
        startDate,
        endDate
    } = req.query;

    const params = [];
    let paramIndex = 1;

    // Build WHERE clause
    let whereClause = 'WHERE 1=1';

    if (userId) {
        whereClause += ` AND al.user_id = $${paramIndex++}`;
        params.push(userId);
    }

    if (websiteId) {
        whereClause += ` AND al.website_id = $${paramIndex++}`;
        params.push(websiteId);
    }

    if (action) {
        whereClause += ` AND al.action ILIKE $${paramIndex++}`;
        params.push(`%${action}%`);
    }

    if (resourceType) {
        whereClause += ` AND al.resource_type = $${paramIndex++}`;
        params.push(resourceType);
    }

    if (startDate) {
        whereClause += ` AND al.created_at >= $${paramIndex++}`;
        params.push(startDate);
    }

    if (endDate) {
        whereClause += ` AND al.created_at <= $${paramIndex++}`;
        params.push(endDate);
    }

    // Get total count
    const countQuery = `
        SELECT COUNT(*) 
        FROM activity_logs al
        ${whereClause}
    `;
    const countResult = await db.query(countQuery, params.slice(0, paramIndex - 1));
    const total = parseInt(countResult.rows[0].count);

    // Build main query
    const query = `
        SELECT al.*,
               u.email as user_email,
               u.full_name as user_name,
               w.name as website_name
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN websites w ON al.website_id = w.id
        ${whereClause}
        ORDER BY al.created_at DESC 
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
        logs: result.rows,
        total,
        limit,
        offset
    });
}));

/**
 * GET /api/logs/actions
 * Get list of distinct actions for filtering
 */
router.get('/actions', requirePermission('system.logs'), asyncHandler(async (req, res) => {
    const result = await db.query(`
        SELECT DISTINCT action, COUNT(*) as count
        FROM activity_logs
        GROUP BY action
        ORDER BY action
    `);

    res.json({ actions: result.rows });
}));

/**
 * GET /api/logs/resource-types
 * Get list of distinct resource types for filtering
 */
router.get('/resource-types', requirePermission('system.logs'), asyncHandler(async (req, res) => {
    const result = await db.query(`
        SELECT DISTINCT resource_type, COUNT(*) as count
        FROM activity_logs
        GROUP BY resource_type
        ORDER BY resource_type
    `);

    res.json({ resourceTypes: result.rows });
}));

/**
 * GET /api/logs/stats
 * Get log statistics
 */
router.get('/stats', requirePermission('system.logs'), asyncHandler(async (req, res) => {
    const totalResult = await db.query('SELECT COUNT(*) FROM activity_logs');
    const todayResult = await db.query(`
        SELECT COUNT(*) FROM activity_logs
        WHERE created_at >= CURRENT_DATE
    `);
    const weekResult = await db.query(`
        SELECT COUNT(*) FROM activity_logs
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
    `);
    const byActionResult = await db.query(`
        SELECT action, COUNT(*) as count
        FROM activity_logs
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY action
        ORDER BY count DESC
        LIMIT 10
    `);
    const byUserResult = await db.query(`
        SELECT u.email, u.full_name, COUNT(*) as count
        FROM activity_logs al
        JOIN users u ON al.user_id = u.id
        WHERE al.created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY u.id, u.email, u.full_name
        ORDER BY count DESC
        LIMIT 10
    `);

    res.json({
        total: parseInt(totalResult.rows[0].count),
        today: parseInt(todayResult.rows[0].count),
        thisWeek: parseInt(weekResult.rows[0].count),
        topActions: byActionResult.rows,
        topUsers: byUserResult.rows
    });
}));

/**
 * GET /api/logs/export
 * Export logs as CSV or JSON
 */
router.get('/export', [
    query('format').optional().isIn(['csv', 'json']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
], requirePermission('system.logs'), asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        throw new APIError('Validation failed', 400, { errors: errors.array() });
    }

    const { format = 'json', startDate, endDate } = req.query;

    let query = `
        SELECT al.*,
               u.email as user_email,
               u.full_name as user_name,
               w.name as website_name
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        LEFT JOIN websites w ON al.website_id = w.id
        WHERE 1=1
    `;

    const params = [];

    if (startDate) {
        query += ` AND al.created_at >= $${params.length + 1}`;
        params.push(startDate);
    }

    if (endDate) {
        query += ` AND al.created_at <= $${params.length + 1}`;
        params.push(endDate);
    }

    query += ` ORDER BY al.created_at DESC LIMIT 10000`;

    const result = await db.query(query, params);

    if (format === 'csv') {
        // Generate CSV
        const headers = ['Timestamp', 'User', 'Action', 'Resource Type', 'Resource ID', 'IP Address', 'Details'];
        const rows = result.rows.map(log => [
            log.created_at,
            log.user_email || 'System',
            log.action,
            log.resource_type,
            log.resource_id || '',
            log.ip_address || '',
            log.details ? JSON.stringify(log.details) : ''
        ]);

        const csv = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="activity-logs.csv"');
        res.send(csv);
    } else {
        res.json({
            exportedAt: new Date().toISOString(),
            count: result.rows.length,
            logs: result.rows
        });
    }
}));

/**
 * GET /api/logs/user/:userId
 * Get logs for a specific user
 */
router.get('/user/:userId', requirePermission('system.logs'), asyncHandler(async (req, res) => {
    const { limit = 50, offset = 0 } = req.query;

    const result = await db.query(`
        SELECT al.*, w.name as website_name
        FROM activity_logs al
        LEFT JOIN websites w ON al.website_id = w.id
        WHERE al.user_id = $1
        ORDER BY al.created_at DESC
        LIMIT $2 OFFSET $3
    `, [req.params.userId, limit, offset]);

    const countResult = await db.query(
        'SELECT COUNT(*) FROM activity_logs WHERE user_id = $1',
        [req.params.userId]
    );

    res.json({
        logs: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit,
        offset
    });
}));

/**
 * GET /api/logs/website/:websiteId
 * Get logs for a specific website
 */
router.get('/website/:websiteId', requirePermission('system.logs'), asyncHandler(async (req, res) => {
    const { limit = 50, offset = 0 } = req.query;

    const result = await db.query(`
        SELECT al.*, u.email as user_email, u.full_name as user_name
        FROM activity_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE al.website_id = $1
        ORDER BY al.created_at DESC
        LIMIT $2 OFFSET $3
    `, [req.params.websiteId, limit, offset]);

    const countResult = await db.query(
        'SELECT COUNT(*) FROM activity_logs WHERE website_id = $1',
        [req.params.websiteId]
    );

    res.json({
        logs: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit,
        offset
    });
}));

module.exports = router;