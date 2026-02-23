/**
 * Universal Website Builder Platform - Control Plane API
 * Main Application Entry Point
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const config = require('./config');
const logger = require('./utils/logger');
const { errorHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const websiteRoutes = require('./routes/websites');
const deploymentRoutes = require('./routes/deployments');
const domainRoutes = require('./routes/domains');
const userRoutes = require('./routes/users');
const systemRoutes = require('./routes/system');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/uploads');
const rolesRoutes = require('./routes/roles');
const settingsRoutes = require('./routes/settings');
const logsRoutes = require('./routes/logs');
const healthRoutes = require('./routes/health');
const apiKeysRoutes = require('./routes/apiKeys');

const app = express();

// Security middleware
app.use(helmet());

// CORS
app.use(cors({
  origin: true, // Allow all origins in development/testing
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMax,
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Compression
app.use(compression());

// Request logging
app.use(morgan('dev'));

// Health check
app.get('/health', async (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/websites', websiteRoutes);
app.use('/api/deployments', deploymentRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/users', userRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/api-keys', apiKeysRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Universal Website Builder Platform',
    version: '1.0.0',
    environment: config.server.nodeEnv,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global error handler
app.use(errorHandler);

// Start server
const server = app.listen(config.server.port, () => {
  logger.info(`🚀 API running on port ${config.server.port}`);
});

module.exports = app;
