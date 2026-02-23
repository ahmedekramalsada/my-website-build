/**
 * Domain Routes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, APIError } = require('../middleware/errorHandler');
const db = require('../config/database');

const router = express.Router();
router.use(authenticate);

/**
 * POST /api/domains
 * Add custom domain to website
 */
router.post('/', [
  body('websiteId').isUUID(),
  body('domain').isFQDN(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new APIError('Validation failed', 400);
  }

  const { websiteId, domain } = req.body;

  // Verify website ownership
  const websiteCheck = await db.query(
    'SELECT id FROM websites WHERE id = $1 AND owner_id = $2',
    [websiteId, req.user.id]
  );

  if (websiteCheck.rows.length === 0) {
    throw new APIError('Website not found', 404);
  }

  // Check if domain already exists
  const domainCheck = await db.query('SELECT id FROM domains WHERE domain = $1', [domain]);
  if (domainCheck.rows.length > 0) {
    throw new APIError('Domain already in use', 409);
  }

  const result = await db.query(
    `INSERT INTO domains (website_id, domain, dns_verification_record)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [websiteId, domain, `_uwbp.${domain}`]
  );

  res.status(201).json({
    message: 'Domain added successfully',
    domain: result.rows[0],
  });
}));

/**
 * GET /api/websites/:websiteId/domains
 * List domains for website
 */
router.get('/website/:websiteId', asyncHandler(async (req, res) => {
  const result = await db.query(
    `SELECT d.* FROM domains d
     JOIN websites w ON d.website_id = w.id
     WHERE w.id = $1 AND w.owner_id = $2 AND d.is_active = true`,
    [req.params.websiteId, req.user.id]
  );

  res.json({ domains: result.rows });
}));

module.exports = router;
