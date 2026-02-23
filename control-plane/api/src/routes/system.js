/**
 * System Routes
 */

const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const db = require('../config/database');
const dockerService = require('../services/dockerService');

const router = express.Router();

/**
 * GET /api/system/stats
 * Get platform statistics
 */
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
  // Get counts
  const usersResult = await db.query('SELECT COUNT(*) as total FROM users WHERE is_active = true');
  const websitesResult = await db.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'running') as running,
      COUNT(*) FILTER (WHERE status = 'stopped') as stopped,
      COUNT(*) FILTER (WHERE status = 'error') as error
    FROM websites 
    WHERE deleted_at IS NULL
  `);

  // Get container stats from Docker
  const containers = await dockerService.listWebsiteContainers();
  const containerStats = {
    total: containers.length,
    running: containers.filter(c => c.State === 'running').length,
  };

  res.json({
    stats: {
      users: parseInt(usersResult.rows[0].total),
      websites: {
        total: parseInt(websitesResult.rows[0].total),
        running: parseInt(websitesResult.rows[0].running),
        stopped: parseInt(websitesResult.rows[0].stopped),
        error: parseInt(websitesResult.rows[0].error),
      },
      containers: containerStats,
    },
  });
}));

/**
 * GET /api/system/settings
 * Get system settings
 */
router.get('/settings', asyncHandler(async (req, res) => {
  const result = await db.query(
    'SELECT key, value, value_type, description FROM system_settings WHERE is_editable = true'
  );

  const settings = {};
  result.rows.forEach(row => {
    let value = row.value;
    if (row.value_type === 'number') value = parseFloat(value);
    if (row.value_type === 'boolean') value = value === 'true';
    if (row.value_type === 'json') value = JSON.parse(value);
    settings[row.key] = value;
  });

  res.json({ settings });
}));

/**
 * PUT /api/system/settings (Admin only)
 */
router.put('/settings', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const updates = req.body;
  
  for (const [key, value] of Object.entries(updates)) {
    await db.query(
      'UPDATE system_settings SET value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 WHERE key = $3',
      [String(value), req.user.id, key]
    );
  }

  res.json({ message: 'Settings updated successfully' });
}));

module.exports = router;
