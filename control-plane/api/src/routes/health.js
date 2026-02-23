/**
 * System Health Routes
 * Monitor system health and metrics
 */

const express = require('express');
const os = require('os');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { asyncHandler } = require('../middleware/errorHandler');
const dockerService = require('../services/dockerService');
const redis = require('../config/redis');
const logger = require('../utils/logger');

const router = express.Router();

// Helper function to format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/health
 * Get comprehensive system health
 */
router.get('/', requirePermission('system.health'), asyncHandler(async (req, res) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks: {}
    };

    // Database check
    try {
        const dbStart = Date.now();
        await db.query('SELECT 1');
        health.checks.database = {
            status: 'healthy',
            responseTime: Date.now() - dbStart
        };
    } catch (error) {
        health.status = 'unhealthy';
        health.checks.database = {
            status: 'unhealthy',
            error: error.message
        };
    }

    // Redis check
    try {
        const redisStart = Date.now();
        await redis.client.ping();
        health.checks.redis = {
            status: 'healthy',
            responseTime: Date.now() - redisStart
        };
    } catch (error) {
        health.status = 'degraded';
        health.checks.redis = {
            status: 'unhealthy',
            error: error.message
        };
    }

    // Docker check
    try {
        const dockerStart = Date.now();
        await dockerService.listContainers();
        health.checks.docker = {
            status: 'healthy',
            responseTime: Date.now() - dockerStart
        };
    } catch (error) {
        health.status = 'degraded';
        health.checks.docker = {
            status: 'unhealthy',
            error: error.message
        };
    }

    res.json(health);
}));

/**
 * GET /api/health/metrics
 * Get detailed system metrics
 */
router.get('/metrics', requirePermission('system.health'), asyncHandler(async (req, res) => {
    // System metrics
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const cpuCount = os.cpus().length;
    const loadAvg = os.loadavg();

    // Process metrics
    const processMemory = process.memoryUsage();

    // Database metrics
    let dbMetrics = {};
    try {
        const dbSize = await db.query(`
            SELECT pg_database_size(current_database()) as size
        `);
        const dbConnections = await db.query(`
            SELECT count(*) as count FROM pg_stat_activity
            WHERE datname = current_database()
        `);
        dbMetrics = {
            size: parseInt(dbSize.rows[0].size),
            connections: parseInt(dbConnections.rows[0].count)
        };
    } catch (error) {
        logger.error('Failed to get DB metrics:', error);
    }

    // Redis metrics
    let redisMetrics = {};
    try {
        const info = await redis.client.info('memory');
        const usedMemoryMatch = info.match(/used_memory:(\d+)/);
        const maxMemoryMatch = info.match(/maxmemory:(\d+)/);

        const keyspaceInfo = await redis.client.info('keyspace');
        const keysMatch = keyspaceInfo.match(/keys=(\d+)/);

        redisMetrics = {
            usedMemory: usedMemoryMatch ? formatBytes(parseInt(usedMemoryMatch[1])) : '0 B',
            maxMemory: maxMemoryMatch ? formatBytes(parseInt(maxMemoryMatch[1])) : '0 B',
            keys: keysMatch ? parseInt(keysMatch[1]) : 0
        };
    } catch (error) {
        logger.error('Failed to get Redis metrics:', error);
    }

    // Docker metrics
    let dockerMetrics = { containers: { total: 0, running: 0, stopped: 0 } };
    try {
        const containers = await dockerService.listWebsiteContainers();
        dockerMetrics = {
            containers: {
                total: containers.length,
                running: containers.filter(c => c.State === 'running').length,
                stopped: containers.filter(c => c.State !== 'running').length
            }
        };
    } catch (error) {
        logger.error('Failed to get Docker metrics:', error);
    }

    // Website metrics
    let websiteMetrics = {};
    try {
        const websiteStats = await db.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'running') as running,
                COUNT(*) FILTER (WHERE status = 'stopped') as stopped,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'error') as error
            FROM websites WHERE deleted_at IS NULL
        `);
        websiteMetrics = websiteStats.rows[0];
    } catch (error) {
        logger.error('Failed to get website metrics:', error);
    }

    // User metrics
    let userMetrics = {};
    try {
        const userStats = await db.query(`
            SELECT 
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE is_active = true) as active,
                COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '24 hours') as active_today,
                COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days') as active_week
            FROM users
        `);
        userMetrics = userStats.rows[0];
    } catch (error) {
        logger.error('Failed to get user metrics:', error);
    }

    res.json({
        system: {
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            uptime: os.uptime(),
            cpu: {
                count: cpuCount,
                model: os.cpus()[0]?.model,
                loadAverage: {
                    '1m': loadAvg[0],
                    '5m': loadAvg[1],
                    '15m': loadAvg[2]
                }
            },
            memory: {
                total: totalMemory,
                used: usedMemory,
                free: freeMemory,
                usagePercent: ((usedMemory / totalMemory) * 100).toFixed(2)
            }
        },
        process: {
            uptime: process.uptime(),
            memory: {
                rss: processMemory.rss,
                heapTotal: processMemory.heapTotal,
                heapUsed: processMemory.heapUsed,
                external: processMemory.external
            },
            nodeVersion: process.version
        },
        database: dbMetrics,
        redis: redisMetrics,
        docker: dockerMetrics,
        websites: websiteMetrics,
        users: userMetrics
    });
}));

/**
 * GET /api/health/containers
 * Get container status details
 */
router.get('/containers', requirePermission('system.health'), asyncHandler(async (req, res) => {
    const containers = await dockerService.listWebsiteContainers();

    const containerDetails = await Promise.all(containers.map(async (container) => {
        try {
            const stats = await dockerService.getContainerStats(container.Id);
            return {
                id: container.Id.substring(0, 12),
                name: container.Names[0]?.replace('/', ''),
                image: container.Image,
                state: container.State,
                status: container.Status,
                created: container.Created,
                cpuPercent: stats?.cpuPercent || 0,
                memoryUsage: stats?.memoryUsage || 0,
                memoryLimit: stats?.memoryLimit || 0,
                networkRx: stats?.networkRx || 0,
                networkTx: stats?.networkTx || 0
            };
        } catch (error) {
            return {
                id: container.Id.substring(0, 12),
                name: container.Names[0]?.replace('/', ''),
                state: container.State,
                error: error.message
            };
        }
    }));

    res.json({
        containers: containerDetails,
        total: containerDetails.length,
        running: containerDetails.filter(c => c.state === 'running').length
    });
}));

/**
 * GET /api/health/database
 * Get database health details
 */
router.get('/database', requirePermission('system.health'), asyncHandler(async (req, res) => {
    const dbVersion = await db.query('SELECT version()');
    const dbSize = await db.query(`SELECT pg_database_size(current_database()) as size`);
    const connections = await db.query(`
        SELECT 
            count(*) as total,
            count(*) FILTER (WHERE state = 'active') as active,
            count(*) FILTER (WHERE state = 'idle') as idle,
            count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
        FROM pg_stat_activity
        WHERE datname = current_database()
    `);
    const tableStats = await db.query(`
        SELECT 
            schemaname,
            relname as table_name,
            n_live_tup as row_count,
            pg_size_pretty(pg_total_relation_size(relid)) as size
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 10
    `);

    res.json({
        version: dbVersion.rows[0].version,
        size: parseInt(dbSize.rows[0].size),
        connections: connections.rows[0],
        tables: tableStats.rows
    });
}));

/**
 * GET /api/health/redis
 * Get Redis health details
 */
router.get('/redis', requirePermission('system.health'), asyncHandler(async (req, res) => {
    const info = await redis.info();
    const memoryInfo = await redis.info('memory');
    const statsInfo = await redis.info('stats');

    // Parse relevant info
    const parseInfo = (str, key) => {
        const match = str.match(new RegExp(`${key}:(.+)`));
        return match ? match[1].trim() : null;
    };

    res.json({
        version: parseInfo(info, 'redis_version'),
        mode: parseInfo(info, 'redis_mode'),
        uptime: parseInt(parseInfo(info, 'uptime_in_seconds') || 0),
        connectedClients: parseInt(parseInfo(info, 'connected_clients') || 0),
        usedMemory: parseInfo(memoryInfo, 'used_memory_human'),
        usedMemoryPeak: parseInfo(memoryInfo, 'used_memory_peak_human'),
        totalConnectionsReceived: parseInt(parseInfo(statsInfo, 'total_connections_received') || 0),
        totalCommandsProcessed: parseInt(parseInfo(statsInfo, 'total_commands_processed') || 0),
        keyspaceHits: parseInt(parseInfo(statsInfo, 'keyspace_hits') || 0),
        keyspaceMisses: parseInt(parseInfo(statsInfo, 'keyspace_misses') || 0)
    });
}));

module.exports = router;