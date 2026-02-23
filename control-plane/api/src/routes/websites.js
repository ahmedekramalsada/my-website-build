/**
 * Website Routes
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, APIError } = require('../middleware/errorHandler');
const websiteService = require('../services/websiteService');
const deploymentService = require('../services/deploymentService');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/websites
 * List user's websites
 */
router.get('/', [
  query('status').optional().isIn(['pending', 'deploying', 'running', 'stopped', 'error']),
  query('template').optional(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new APIError('Validation failed', 400);
  }

  const options = {
    status: req.query.status,
    template: req.query.template,
    limit: req.query.limit || 20,
    offset: req.query.offset || 0,
  };

  const websites = await websiteService.listWebsites(req.user.id, options);

  res.json({
    websites,
    pagination: {
      limit: options.limit,
      offset: options.offset,
    },
  });
}));

/**
 * POST /api/websites
 * Create a new website
 */
router.post('/', [
  body('name').trim().isLength({ min: 1, max: 255 }),
  body('description').optional().trim(),
  body('templateType').isIn(['nextjs', 'nuxt', 'react', 'vue', 'static', 'nodejs', 'python', 'php', 'custom']),
  body('resourceConfig').optional().isObject(),
  body('environmentVars').optional().isObject(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new APIError('Validation failed', 400);
  }

  const { name, description, templateType, resourceConfig, environmentVars } = req.body;

  // Check quota
  const quotaCheck = await websiteService.checkQuota(req.user.id, resourceConfig || {});
  if (!quotaCheck.allowed) {
    throw new APIError(`Quota exceeded: ${quotaCheck.errors.join(', ')}`, 403);
  }

  const website = await websiteService.createWebsite(req.user.id, {
    name,
    description,
    templateType,
    resourceConfig,
    environmentVars,
  });

  res.status(201).json({
    message: 'Website created successfully',
    website,
  });
}));

/**
 * GET /api/websites/:id
 * Get website details
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const website = await websiteService.getWebsite(req.params.id, req.user.id);
  res.json({ website });
}));

/**
 * PUT /api/websites/:id
 * Update website
 */
router.put('/:id', [
  body('name').optional().trim().isLength({ min: 1, max: 255 }),
  body('description').optional().trim(),
  body('resourceConfig').optional().isObject(),
  body('environmentVars').optional().isObject(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new APIError('Validation failed', 400);
  }

  const website = await websiteService.updateWebsite(req.params.id, req.user.id, req.body);

  res.json({
    message: 'Website updated successfully',
    website,
  });
}));

/**
 * DELETE /api/websites/:id
 * Delete website
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  // Stop container first
  try {
    await deploymentService.stopWebsite(req.params.id, req.user.id);
  } catch (error) {
    // Ignore if already stopped
  }

  const result = await websiteService.deleteWebsite(req.params.id, req.user.id);

  res.json({
    message: 'Website deleted successfully',
    ...result,
  });
}));

/**
 * POST /api/websites/:id/deploy
 * Deploy website
 */
router.post('/:id/deploy', asyncHandler(async (req, res) => {
  const result = await deploymentService.deployWebsite(req.params.id, req.user.id);

  res.json({
    message: 'Deployment started',
    ...result,
  });
}));

/**
 * POST /api/websites/:id/stop
 * Stop website
 */
router.post('/:id/stop', asyncHandler(async (req, res) => {
  const result = await deploymentService.stopWebsite(req.params.id, req.user.id);

  res.json({
    message: 'Website stopped',
    ...result,
  });
}));

/**
 * POST /api/websites/:id/start
 * Start website
 */
router.post('/:id/start', asyncHandler(async (req, res) => {
  const result = await deploymentService.startWebsite(req.params.id, req.user.id);

  res.json({
    message: 'Website started',
    ...result,
  });
}));

/**
 * GET /api/websites/:id/logs
 * Get website logs
 */
router.get('/:id/logs', [
  query('tail').optional().isInt({ min: 1, max: 1000 }).toInt(),
], asyncHandler(async (req, res) => {
  const tail = req.query.tail || 100;
  const logs = await deploymentService.getLogs(req.params.id, req.user.id, tail);

  res.json({ logs });
}));

/**
 * GET /api/websites/:id/stats
 * Get website stats
 */
router.get('/:id/stats', asyncHandler(async (req, res) => {
  const stats = await deploymentService.getStats(req.params.id, req.user.id);

  res.json({ stats });
}));

module.exports = router;
