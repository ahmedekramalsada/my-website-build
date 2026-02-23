/**
 * Deployment Routes
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, APIError } = require('../middleware/errorHandler');
const deploymentService = require('../services/deploymentService');

const router = express.Router();
router.use(authenticate);

/**
 * GET /api/deployments/:id
 * Get deployment details
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const deployment = await deploymentService.getDeploymentStatus(req.params.id);
  
  // Verify ownership through website
  const db = require('../config/database');
  const websiteCheck = await db.query(
    'SELECT id FROM websites WHERE id = $1 AND owner_id = $2',
    [deployment.website_id, req.user.id]
  );
  
  if (websiteCheck.rows.length === 0) {
    throw new APIError('Deployment not found', 404);
  }

  res.json({ deployment });
}));

/**
 * GET /api/websites/:websiteId/deployments
 * List deployments for a website
 */
router.get('/website/:websiteId', asyncHandler(async (req, res) => {
  const { limit, offset } = req.query;
  const deployments = await deploymentService.listDeployments(
    req.params.websiteId,
    req.user.id,
    { limit: parseInt(limit) || 10, offset: parseInt(offset) || 0 }
  );

  res.json({ deployments });
}));

module.exports = router;
