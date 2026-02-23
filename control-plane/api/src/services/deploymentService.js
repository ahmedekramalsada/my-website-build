/**
 * Deployment Service - Orchestrates website deployments
 */

const db = require('../config/database');
const dockerService = require('./dockerService');
const logger = require('../utils/logger');
const { APIError } = require('../middleware/errorHandler');

class DeploymentService {
  /**
   * Deploy a website
   */
  async deployWebsite(websiteId, userId) {
    // Get website details
    const websiteResult = await db.query(
      'SELECT * FROM websites WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL',
      [websiteId, userId]
    );

    if (websiteResult.rows.length === 0) {
      throw new APIError('Website not found', 404);
    }

    const website = websiteResult.rows[0];

    // Create deployment record
    const version = (website.deploy_count || 0) + 1;
    const deploymentResult = await db.query(
      `INSERT INTO website_deployments (
        website_id, version, container_image, status, 
        environment_vars_snapshot, resource_config_snapshot
      ) VALUES ($1, $2, $3, 'deploying', $4, $5)
      RETURNING *`,
      [
        websiteId,
        version,
        dockerService.getImageForTemplate(website.template_type),
        JSON.stringify(website.environment_vars),
        JSON.stringify(website.resource_config),
      ]
    );

    const deployment = deploymentResult.rows[0];

    try {
      // Update website status
      await db.query(
        "UPDATE websites SET status = 'deploying', deploy_count = deploy_count + 1 WHERE id = $1",
        [websiteId]
      );

      // Create container
      const containerInfo = await dockerService.createContainer(website);

      // Update deployment with container info
      await db.query(
        "UPDATE website_deployments SET container_id = $1, status = 'running', completed_at = CURRENT_TIMESTAMP WHERE id = $2",
        [containerInfo.containerId, deployment.id]
      );

      // Update website status
      await db.query(
        "UPDATE websites SET status = 'running', last_deployed_at = CURRENT_TIMESTAMP WHERE id = $1",
        [websiteId]
      );

      logger.info(`Website deployed: ${websiteId} (version ${version})`);

      return {
        deploymentId: deployment.id,
        version,
        containerId: containerInfo.containerId,
        status: 'running',
      };
    } catch (error) {
      // Mark deployment as failed
      await db.query(
        "UPDATE website_deployments SET status = 'failed', failed_at = CURRENT_TIMESTAMP, error_message = $1 WHERE id = $2",
        [error.message, deployment.id]
      );

      await db.query(
        "UPDATE websites SET status = 'error', last_error = $1 WHERE id = $2",
        [error.message, websiteId]
      );

      throw error;
    }
  }

  /**
   * Stop a website
   */
  async stopWebsite(websiteId, userId) {
    const websiteResult = await db.query(
      'SELECT * FROM websites WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL',
      [websiteId, userId]
    );

    if (websiteResult.rows.length === 0) {
      throw new APIError('Website not found', 404);
    }

    const website = websiteResult.rows[0];
    const containerName = `website-${website.subdomain}`;

    await dockerService.stopContainer(containerName);

    await db.query(
      "UPDATE websites SET status = 'stopped' WHERE id = $1",
      [websiteId]
    );

    logger.info(`Website stopped: ${websiteId}`);

    return { status: 'stopped' };
  }

  /**
   * Start a stopped website
   */
  async startWebsite(websiteId, userId) {
    const websiteResult = await db.query(
      'SELECT * FROM websites WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL',
      [websiteId, userId]
    );

    if (websiteResult.rows.length === 0) {
      throw new APIError('Website not found', 404);
    }

    const website = websiteResult.rows[0];
    const containerName = `website-${website.subdomain}`;

    // Check if container exists
    const existingContainer = await dockerService.getContainer(containerName);

    if (!existingContainer) {
      // Container doesn't exist, deploy it
      logger.info(`Container ${containerName} doesn't exist, deploying...`);
      return await this.deployWebsite(websiteId, userId);
    }

    await dockerService.startContainer(containerName);

    await db.query(
      "UPDATE websites SET status = 'running' WHERE id = $1",
      [websiteId]
    );

    logger.info(`Website started: ${websiteId}`);

    return { status: 'running' };
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(deploymentId) {
    const result = await db.query(
      `SELECT d.*, w.name as website_name, w.subdomain 
       FROM website_deployments d
       JOIN websites w ON d.website_id = w.id
       WHERE d.id = $1`,
      [deploymentId]
    );

    if (result.rows.length === 0) {
      throw new APIError('Deployment not found', 404);
    }

    return result.rows[0];
  }

  /**
   * List deployments for a website
   */
  async listDeployments(websiteId, userId, options = {}) {
    const { limit = 10, offset = 0 } = options;

    // Verify ownership
    const websiteCheck = await db.query(
      'SELECT id FROM websites WHERE id = $1 AND owner_id = $2',
      [websiteId, userId]
    );

    if (websiteCheck.rows.length === 0) {
      throw new APIError('Website not found', 404);
    }

    const result = await db.query(
      `SELECT * FROM website_deployments 
       WHERE website_id = $1 
       ORDER BY version DESC 
       LIMIT $2 OFFSET $3`,
      [websiteId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get container logs
   */
  async getLogs(websiteId, userId, tail = 100) {
    const websiteResult = await db.query(
      'SELECT subdomain FROM websites WHERE id = $1 AND owner_id = $2',
      [websiteId, userId]
    );

    if (websiteResult.rows.length === 0) {
      throw new APIError('Website not found', 404);
    }

    const { subdomain } = websiteResult.rows[0];
    const containerName = `website-${subdomain}`;

    return await dockerService.getContainerLogs(containerName, tail);
  }

  /**
   * Get container stats
   */
  async getStats(websiteId, userId) {
    const websiteResult = await db.query(
      'SELECT subdomain FROM websites WHERE id = $1 AND owner_id = $2',
      [websiteId, userId]
    );

    if (websiteResult.rows.length === 0) {
      throw new APIError('Website not found', 404);
    }

    const { subdomain } = websiteResult.rows[0];
    const containerName = `website-${subdomain}`;

    return await dockerService.getContainerStats(containerName);
  }
}

module.exports = new DeploymentService();
