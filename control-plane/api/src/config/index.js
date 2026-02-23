/**
 * Configuration Management
 * Centralizes all environment variables and settings
 */

require('dotenv').config();

const config = {
  // Server settings
  server: {
    port: parseInt(process.env.PORT, 10) || 8080,
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  },

  // Database
  database: {
    url: process.env.DATABASE_URL || 'postgresql://uwbp:uwbp@localhost:5432/uwbp',
    poolSize: parseInt(process.env.DB_POOL_SIZE, 10) || 20,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD,
  },

  // Security
  security: {
    jwtSecret: process.env.JWT_SECRET || 'development-secret-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  },

  // Storage
  storage: {
    endpoint: process.env.MINIO_ENDPOINT || 'localhost:9000',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucket: process.env.MINIO_BUCKET || 'uwbp-websites',
    useSSL: process.env.MINIO_USE_SSL === 'true',
    region: process.env.MINIO_REGION || 'us-east-1',
  },

  // Orchestration
  orchestration: {
    mode: process.env.ORCHESTRATION_MODE || 'docker',
    dockerNetwork: process.env.DOCKER_NETWORK || 'uwbp-network',
    k8sNamespace: process.env.K8S_NAMESPACE || 'default',
    k8sConfigPath: process.env.K8S_CONFIG_PATH,
  },

  // Domain
  domain: {
    suffix: process.env.DOMAIN_SUFFIX || 'localhost',
    useSSL: process.env.USE_SSL === 'true',
    certEmail: process.env.CERT_EMAIL || 'admin@example.com',
  },

  // Resources
  resources: {
    defaultCpuLimit: parseFloat(process.env.DEFAULT_CPU_LIMIT) || 0.5,
    defaultMemoryLimit: parseInt(process.env.DEFAULT_MEMORY_LIMIT, 10) || 512,
    defaultStorageLimit: parseInt(process.env.DEFAULT_STORAGE_LIMIT, 10) || 1,
    maxCpuLimit: parseFloat(process.env.MAX_CPU_LIMIT) || 4.0,
    maxMemoryLimit: parseInt(process.env.MAX_MEMORY_LIMIT, 10) || 4096,
    maxStorageLimit: parseInt(process.env.MAX_STORAGE_LIMIT, 10) || 100,
  },

  // Features
  features: {
    autoSuspendEnabled: process.env.AUTO_SUSPEND_ENABLED !== 'false',
    autoSuspendAfterDays: parseInt(process.env.AUTO_SUSPEND_AFTER_DAYS, 10) || 30,
    registrationEnabled: process.env.REGISTRATION_ENABLED !== 'false',
    maxWebsitesPerUser: parseInt(process.env.MAX_WEBSITES_PER_USER, 10) || 10,
  },

  // Paths
  paths: {
    templatesDir: process.env.TEMPLATES_DIR || '/app/templates',
    buildsDir: process.env.BUILDS_DIR || '/app/builds',
    logsDir: process.env.LOGS_DIR || '/app/logs',
  },
};

// Validation
function validateConfig() {
  const required = [
    'security.jwtSecret',
    'database.url',
  ];

  const missing = required.filter(path => {
    const value = path.split('.').reduce((obj, key) => obj?.[key], config);
    return !value || value === 'development-secret-change-in-production';
  });

  if (missing.length > 0) {
    console.error('Missing required configuration:', missing);
    if (config.server.nodeEnv === 'production') {
      process.exit(1);
    }
  }

  if (config.security.jwtSecret === 'development-secret-change-in-production') {
    console.warn('WARNING: Using default JWT secret. Change this in production!');
  }
}

validateConfig();

module.exports = config;
