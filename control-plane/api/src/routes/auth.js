/**
 * Authentication Routes
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const config = require('../config');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, APIError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('fullName').optional().trim(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new APIError('Validation failed', 400, 'VALIDATION_ERROR');
  }

  const { email, password, fullName } = req.body;

  // Check if registration is enabled
  if (!config.features.registrationEnabled) {
    throw new APIError('Registration is currently disabled', 403);
  }

  // Check if user already exists
  const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existingUser.rows.length > 0) {
    throw new APIError('Email already registered', 409);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

  // Create user
  const result = await db.query(
    `INSERT INTO users (email, password_hash, full_name, quota_max_websites, quota_max_cpu, quota_max_memory, quota_max_storage)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, email, full_name, role, created_at`,
    [email, passwordHash, fullName, 10, 2.0, 2048, 10]
  );

  const user = result.rows[0];

  // Generate JWT
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    config.security.jwtSecret,
    { expiresIn: config.security.jwtExpiresIn }
  );

  logger.info(`User registered: ${email}`);

  res.status(201).json({
    message: 'User registered successfully',
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    },
    token,
  });
}));

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new APIError('Validation failed', 400, 'VALIDATION_ERROR');
  }

  const { email, password } = req.body;

  // Get user with roles
  const result = await db.query(
    `SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.is_active,
      COALESCE(
        json_agg(
          json_build_object('id', r.id, 'name', r.name, 'display_name', r.display_name)
        ) FILTER (WHERE r.id IS NOT NULL), '[]'
      ) as roles
     FROM users u
     LEFT JOIN user_roles ur ON u.id = ur.user_id
     LEFT JOIN roles r ON ur.role_id = r.id
     WHERE u.email = $1
     GROUP BY u.id`,
    [email]
  );

  if (result.rows.length === 0) {
    throw new APIError('Invalid credentials', 401);
  }

  const user = result.rows[0];

  if (!user.is_active) {
    throw new APIError('Account is disabled', 403);
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new APIError('Invalid credentials', 401);
  }

  // Update last login
  await db.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

  // Generate JWT
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    config.security.jwtSecret,
    { expiresIn: config.security.jwtExpiresIn }
  );

  logger.info(`User logged in: ${email}`);

  res.json({
    message: 'Login successful',
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      roles: user.roles,
    },
    token,
  });
}));

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  // Get fresh user data with quota and roles
  const result = await db.query(
    `SELECT u.*, 
      COUNT(w.id) as used_websites,
      COALESCE(SUM((w.resource_config->>'cpu_limit')::decimal), 0) as used_cpu,
      COALESCE(SUM((w.resource_config->>'memory_limit')::integer), 0) as used_memory,
      COALESCE(SUM((w.resource_config->>'storage_limit')::integer), 0) as used_storage,
      COALESCE(
        json_agg(
          json_build_object('id', r.id, 'name', r.name, 'display_name', r.display_name)
        ) FILTER (WHERE r.id IS NOT NULL), '[]'
      ) as roles
     FROM users u
     LEFT JOIN websites w ON u.id = w.owner_id AND w.deleted_at IS NULL
     LEFT JOIN user_roles ur ON u.id = ur.user_id
     LEFT JOIN roles r ON ur.role_id = r.id
     WHERE u.id = $1
     GROUP BY u.id`,
    [req.user.id]
  );

  const user = result.rows[0];

  res.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      roles: user.roles,
      isActive: user.is_active,
      createdAt: user.created_at,
      quota: {
        maxWebsites: user.quota_max_websites,
        maxCpu: user.quota_max_cpu,
        maxMemory: user.quota_max_memory,
        maxStorage: user.quota_max_storage,
        usedWebsites: parseInt(user.used_websites),
        usedCpu: parseFloat(user.used_cpu),
        usedMemory: parseInt(user.used_memory),
        usedStorage: parseInt(user.used_storage),
      },
    },
  });
}));

module.exports = router;
