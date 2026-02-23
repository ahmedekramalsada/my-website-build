/**
 * PostgreSQL Database Configuration
 */

const { Pool } = require('pg');
const config = require('./index');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: config.database.url,
  max: config.database.poolSize,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: config.database.ssl,
});

pool.on('connect', () => {
  logger.debug('New client connected to database');
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error:', err);
});

async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Database query executed', {
      query: text.substring(0, 100),
      duration: `${duration}ms`,
      rows: result.rowCount,
    });
    return result;
  } catch (error) {
    logger.error('Database query failed', { query: text.substring(0, 100), error: error.message });
    throw error;
  }
}

async function getClient() {
  return await pool.connect();
}

async function withTransaction(callback) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  query,
  getClient,
  withTransaction,
  pool,
};
