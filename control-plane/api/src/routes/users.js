/**
 * User Routes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, APIError } = require('../middleware/errorHandler');
const db = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/users/quota
 * Get current user's quota usage
 */
router.get('/quota', asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT 
      u.quota_max_websites, u.quota_max_cpu, u.quota_max_memory, u.quota_max_storage,
      COUNT(w.id) as websites_count,
      COALESCE(SUM((w.resource_config->>'cpu_limit')::decimal), 0) as used_cpu,
      COALESCE(SUM((w.resource_config->>'memory_limit')::integer), 0) as used_memory,
      COALESCE(SUM((w.resource_config->>'storage_limit')::integer), 0) as used_storage
     FROM users u
     LEFT JOIN websites w ON u.id = w.owner_id AND w.deleted_at IS NULL
     WHERE u.id = $1
     GROUP BY u.id`,
    [req.user.id]
  );

  if (result.rows.length === 0) {
    throw new APIError('User not found', 404);
  }

  const row = result.rows[0];
  res.json({
    quotaMaxWebsites: row.quota_max_websites,
    quotaMaxCpu: parseFloat(row.quota_max_cpu),
    quotaMaxMemory: row.quota_max_memory,
    quotaMaxStorage: row.quota_max_storage,
    websitesCount: parseInt(row.websites_count),
    usedCpu: parseFloat(row.used_cpu),
    usedMemory: parseInt(row.used_memory),
    usedStorage: parseInt(row.used_storage),
  });
}));

/**
 * PUT /api/users/profile
 * Update current user's profile
 */
router.put('/profile', asyncHandler(async (req, res) => {
  const { fullName } = req.body;

  if (!fullName || fullName.trim().length < 2) {
    throw new APIError('Name must be at least 2 characters', 400);
  }

  const result = await db.query(
    `UPDATE users 
     SET full_name = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING id, email, full_name, role`,
    [fullName.trim(), req.user.id]
  );

  if (result.rows.length === 0) {
    throw new APIError('User not found', 404);
  }

  logger.info(`User profile updated: ${req.user.email}`);

  res.json({
    message: 'Profile updated successfully',
    user: result.rows[0],
  });
}));

/**
 * PUT /api/users/password
 * Change current user's password
 */
router.put('/password', asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new APIError('Current and new password are required', 400);
  }

  if (newPassword.length < 6) {
    throw new APIError('New password must be at least 6 characters', 400);
  }

  // Get current user with password hash
  const userResult = await db.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.user.id]
  );

  if (userResult.rows.length === 0) {
    throw new APIError('User not found', 404);
  }

  // Verify current password
  const isValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
  if (!isValid) {
    throw new APIError('Current password is incorrect', 401);
  }

  // Hash new password
  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  // Update password
  await db.query(
    'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [newPasswordHash, req.user.id]
  );

  logger.info(`User password changed: ${req.user.email}`);

  res.json({ message: 'Password changed successfully' });
}));

module.exports = router;
