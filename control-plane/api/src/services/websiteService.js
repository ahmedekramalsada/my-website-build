/**
 * Website Service - Business logic for website management
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const { APIError } = require('../middleware/errorHandler');

class WebsiteService {
  /**
   * Create a new website
   */
  async createWebsite(userId, websiteData) {
    const { name, description, templateType, resourceConfig, environmentVars } = websiteData;

    // Generate unique subdomain
    const subdomain = this.generateSubdomain();

    // Insert website record
    const result = await db.query(
      `INSERT INTO websites (
        owner_id, name, description, subdomain, template_type, 
        resource_config, environment_vars, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *`,
      [
        userId,
        name,
        description,
        subdomain,
        templateType,
        JSON.stringify(resourceConfig || {}),
        JSON.stringify(environmentVars || {}),
      ]
    );

    const website = result.rows[0];
    
    // Cache website data
    await this.cacheWebsite(website);
    
    logger.info(`Website created: ${website.id} (${subdomain})`);
    
    return website;
  }

  /**
   * Get website by ID
   */
  async getWebsite(websiteId, userId = null) {
    // Try cache first
    const cached = await redis.get(`website:${websiteId}`);
    if (cached) {
      // Check ownership if userId provided
      if (userId && cached.owner_id !== userId) {
        throw new APIError('Website not found', 404);
      }
      return cached;
    }

    // Query database
    const query = userId 
      ? 'SELECT * FROM websites WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL'
      : 'SELECT * FROM websites WHERE id = $1 AND deleted_at IS NULL';
    
    const params = userId ? [websiteId, userId] : [websiteId];
    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      throw new APIError('Website not found', 404);
    }

    const website = result.rows[0];
    await this.cacheWebsite(website);
    
    return website;
  }

  /**
   * List websites for user
   */
  async listWebsites(userId, options = {}) {
    const { status, template, limit = 20, offset = 0 } = options;
    
    let query = 'SELECT * FROM websites WHERE owner_id = $1 AND deleted_at IS NULL';
    const params = [userId];

    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    if (template) {
      query += ` AND template_type = $${params.length + 1}`;
      params.push(template);
    }

    query += ' ORDER BY created_at DESC';
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    return result.rows;
  }

  /**
   * Update website
   */
  async updateWebsite(websiteId, userId, updates) {
    const allowedFields = ['name', 'description', 'resource_config', 'environment_vars', 'custom_domain'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (setClause.length === 0) {
      throw new APIError('No valid fields to update', 400);
    }

    values.push(websiteId, userId);
    const query = `
      UPDATE websites 
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex} AND owner_id = $${paramIndex + 1} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new APIError('Website not found', 404);
    }

    const website = result.rows[0];
    await this.cacheWebsite(website);
    
    logger.info(`Website updated: ${websiteId}`);
    
    return website;
  }

  /**
   * Delete website (soft delete)
   */
  async deleteWebsite(websiteId, userId) {
    const result = await db.query(
      `UPDATE websites 
       SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1, status = 'deleted'
       WHERE id = $2 AND owner_id = $1 AND deleted_at IS NULL
       RETURNING id`,
      [userId, websiteId]
    );

    if (result.rows.length === 0) {
      throw new APIError('Website not found', 404);
    }

    // Clear cache
    await redis.del(`website:${websiteId}`);
    
    logger.info(`Website deleted: ${websiteId}`);
    
    return { deleted: true };
  }

  /**
   * Check user quota
   */
  async checkQuota(userId, requestedResources) {
    const result = await db.query(
      `SELECT 
        u.quota_max_websites,
        u.quota_max_cpu,
        u.quota_max_memory,
        u.quota_max_storage,
        COUNT(w.id) as current_websites,
        COALESCE(SUM((w.resource_config->>'cpu_limit')::decimal), 0) as used_cpu,
        COALESCE(SUM((w.resource_config->>'memory_limit')::integer), 0) as used_memory,
        COALESCE(SUM((w.resource_config->>'storage_limit')::integer), 0) as used_storage
      FROM users u
      LEFT JOIN websites w ON u.id = w.owner_id AND w.deleted_at IS NULL
      WHERE u.id = $1
      GROUP BY u.id, u.quota_max_websites, u.quota_max_cpu, u.quota_max_memory, u.quota_max_storage`,
      [userId]
    );

    const quota = result.rows[0];
    
    const errors = [];
    
    if (quota.current_websites >= quota.quota_max_websites) {
      errors.push(`Website limit reached (${quota.quota_max_websites})`);
    }
    
    const newCpu = (quota.used_cpu || 0) + (requestedResources.cpu || 0.5);
    if (newCpu > quota.quota_max_cpu) {
      errors.push(`CPU quota exceeded (${quota.quota_max_cpu} cores)`);
    }
    
    const newMemory = (quota.used_memory || 0) + (requestedResources.memory || 512);
    if (newMemory > quota.quota_max_memory) {
      errors.push(`Memory quota exceeded (${quota.quota_max_memory} MB)`);
    }

    return {
      allowed: errors.length === 0,
      errors,
      current: quota,
    };
  }

  /**
   * Generate unique subdomain
   */
  generateSubdomain() {
    return uuidv4().substring(0, 8).toLowerCase();
  }

  /**
   * Cache website data
   */
  async cacheWebsite(website) {
    await redis.set(`website:${website.id}`, website, 300); // 5 minutes
  }
}

module.exports = new WebsiteService();
