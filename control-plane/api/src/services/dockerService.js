/**
 * Docker Service - Container management for single VM deployment
 */

const Docker = require('dockerode');
const config = require('../config');
const logger = require('../utils/logger');
const { APIError } = require('../middleware/errorHandler');

class DockerService {
  constructor() {
    this.docker = new Docker();
    this.networkName = config.orchestration.dockerNetwork;
  }

  /**
   * Create and start a container for a website
   */
  async createContainer(website) {
    const containerName = `website-${website.subdomain}`;

    try {
      // Check if container already exists and remove it
      try {
        const existingContainer = this.docker.getContainer(containerName);
        await existingContainer.stop({ t: 5 }).catch(() => { });
        await existingContainer.remove({ force: true });
        logger.info(`Removed existing container: ${containerName}`);
      } catch (err) {
        // Container doesn't exist, continue
      }

      // Build container configuration
      const containerConfig = this.buildContainerConfig(website);

      // Create and start container
      const container = await this.docker.createContainer(containerConfig);
      await container.start();

      logger.info(`Container created: ${containerName} (${container.id})`);

      return {
        containerId: container.id,
        name: containerName,
        status: 'running',
      };
    } catch (error) {
      logger.error(`Failed to create container ${containerName}:`, error);
      throw new APIError(`Container creation failed: ${error.message}`, 500);
    }
  }

  /**
   * Stop a container
   */
  async stopContainer(containerName) {
    try {
      const container = this.docker.getContainer(containerName);
      await container.stop({ t: 10 }); // 10 second timeout
      logger.info(`Container stopped: ${containerName}`);
      return true;
    } catch (error) {
      if (error.statusCode === 304) {
        // Already stopped
        return true;
      }
      if (error.statusCode === 404) {
        // Container doesn't exist
        return false;
      }
      logger.error(`Failed to stop container ${containerName}:`, error);
      throw error;
    }
  }

  /**
   * Start a stopped container
   */
  async startContainer(containerName) {
    try {
      const container = this.docker.getContainer(containerName);
      await container.start();
      logger.info(`Container started: ${containerName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to start container ${containerName}:`, error);
      throw error;
    }
  }

  /**
   * Remove a container
   */
  async removeContainer(containerName) {
    try {
      // Stop first if running
      await this.stopContainer(containerName).catch(() => { });

      const container = this.docker.getContainer(containerName);
      await container.remove({ force: true });
      logger.info(`Container removed: ${containerName}`);
      return true;
    } catch (error) {
      if (error.statusCode === 404) {
        return false; // Already removed
      }
      logger.error(`Failed to remove container ${containerName}:`, error);
      throw error;
    }
  }

  /**
   * Get container info
   */
  async getContainer(containerName) {
    try {
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();
      return info;
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get container logs
   */
  async getContainerLogs(containerName, tail = 100) {
    try {
      const container = this.docker.getContainer(containerName);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true,
      });
      return logs.toString('utf8');
    } catch (error) {
      logger.error(`Failed to get logs for ${containerName}:`, error);
      return '';
    }
  }

  /**
   * Get container stats
   */
  async getContainerStats(containerName) {
    try {
      const container = this.docker.getContainer(containerName);
      const stats = await container.stats({ stream: false });
      return this.parseStats(stats);
    } catch (error) {
      logger.error(`Failed to get stats for ${containerName}:`, error);
      return null;
    }
  }

  /**
   * List all website containers
   */
  async listWebsiteContainers() {
    try {
      const containers = await this.docker.listContainers({ all: true });
      return containers.filter(c =>
        c.Names.some(name => name.startsWith('/website-'))
      );
    } catch (error) {
      logger.error('Failed to list containers:', error);
      return [];
    }
  }

  /**
   * Build container configuration
   */
  buildContainerConfig(website) {
    const containerName = `website-${website.subdomain}`;
    const image = this.getImageForTemplate(website.template_type);
    // Use template-specific default port, ignore database default of 3000 for non-node templates
    const defaultPort = this.getDefaultPort(website.template_type);
    const internalPort = (website.internal_port && website.internal_port !== 3000)
      ? website.internal_port
      : defaultPort;

    const resourceConfig = website.resource_config || {};
    const cpuLimit = resourceConfig.cpu_limit || 0.5;
    const memoryLimit = resourceConfig.memory_limit || 512;

    return {
      name: containerName,
      Image: image,
      Env: this.buildEnvironmentVars(website),
      ExposedPorts: {
        [`${internalPort}/tcp`]: {},
      },
      Labels: {
        'traefik.enable': 'true',
        [`traefik.http.routers.${website.subdomain}.rule`]: `Host(\`${website.subdomain}.${config.domain.suffix}\`)`,
        [`traefik.http.routers.${website.subdomain}.service`]: website.subdomain,
        [`traefik.http.services.${website.subdomain}.loadbalancer.server.port`]: String(internalPort),
        'uwbp.website.id': website.id,
        'uwbp.website.subdomain': website.subdomain,
      },
      HostConfig: {
        NetworkMode: this.networkName,
        RestartPolicy: {
          Name: 'unless-stopped',
        },
        Memory: memoryLimit * 1024 * 1024, // Convert MB to bytes
        CpuQuota: Math.round(cpuLimit * 100000), // CPU quota in microseconds
        CpuPeriod: 100000,
      },
    };
  }

  /**
   * Get Docker image for template type
   */
  getImageForTemplate(templateType) {
    const images = {
      nextjs: 'node:18-alpine',
      nuxt: 'node:18-alpine',
      react: 'node:18-alpine',
      vue: 'node:18-alpine',
      static: 'nginx:alpine',
      nodejs: 'node:18-alpine',
      python: 'python:3.11-alpine',
      php: 'php:8.2-apache',
      custom: 'node:18-alpine',
    };
    return images[templateType] || 'node:18-alpine';
  }

  /**
   * Get default port for template type
   */
  getDefaultPort(templateType) {
    const ports = {
      nextjs: 3000,
      nuxt: 3000,
      react: 3000,
      vue: 3000,
      static: 80,
      nodejs: 3000,
      python: 8000,
      php: 80,
      custom: 3000,
    };
    return ports[templateType] || 3000;
  }

  /**
   * Build environment variables array
   */
  buildEnvironmentVars(website) {
    const envVars = website.environment_vars || {};
    const envArray = [];

    for (const [key, value] of Object.entries(envVars)) {
      envArray.push(`${key}=${value}`);
    }

    // Add default vars
    envArray.push(`PORT=${website.internal_port || 3000}`);
    envArray.push(`NODE_ENV=production`);
    envArray.push(`WEBSITE_ID=${website.id}`);
    envArray.push(`WEBSITE_SUBDOMAIN=${website.subdomain}`);

    return envArray;
  }

  /**
   * Parse Docker stats into usable format
   */
  parseStats(stats) {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * 100 : 0;

    const memoryUsage = stats.memory_stats.usage || 0;
    const memoryLimit = stats.memory_stats.limit || 1;

    return {
      cpuPercent: Math.round(cpuPercent * 100) / 100,
      memoryUsage: Math.round(memoryUsage / 1024 / 1024), // MB
      memoryLimit: Math.round(memoryLimit / 1024 / 1024), // MB
      memoryPercent: Math.round((memoryUsage / memoryLimit) * 100 * 100) / 100,
      networkRx: stats.networks?.eth0?.rx_bytes || 0,
      networkTx: stats.networks?.eth0?.tx_bytes || 0,
      pids: stats.pids_stats?.current || 0,
    };
  }
}

module.exports = new DockerService();
