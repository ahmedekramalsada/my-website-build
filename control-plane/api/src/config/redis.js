/**
 * Redis Configuration
 */

const redis = require('redis');
const config = require('./index');
const logger = require('../utils/logger');

const client = redis.createClient({
  url: config.redis.url,
  password: config.redis.password,
});

client.on('connect', () => logger.info('Redis client connected'));
client.on('error', (err) => logger.error('Redis client error:', err));

(async () => {
  try {
    await client.connect();
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
  }
})();

async function get(key) {
  try {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.error('Redis get error:', error);
    return null;
  }
}

async function set(key, value, ttl = 3600) {
  try {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await client.setEx(key, ttl, serialized);
    } else {
      await client.set(key, serialized);
    }
  } catch (error) {
    logger.error('Redis set error:', error);
  }
}

async function del(key) {
  try {
    await client.del(key);
  } catch (error) {
    logger.error('Redis del error:', error);
  }
}

module.exports = {
  get,
  set,
  del,
  client,
};
