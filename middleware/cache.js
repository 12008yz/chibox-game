const redis = require('redis');
let logger;
try {
  logger = require('../middleware/logger');
  if (!logger || typeof logger.error !== 'function') {
    logger = console;
  }
} catch {
  logger = console;
}

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
});

client.on('error', (err) => {
  logger.error('Redis Client Error', err);
});

client.connect().catch(err => {
  logger.error('Ошибка подключения к Redis:', err);
});

const cache = (duration = 300) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    const key = `cache:${req.user?.id || 'guest'}:${req.originalUrl}`;

    try {
      const cached = await client.get(key);
      if (cached) {
        logger.info(`Cache hit for key: ${key}`);
        return res.json(JSON.parse(cached));
      }
    } catch (error) {
      logger.warn(`Cache miss or error for key ${key}: ${error.message}`);
    }

    const originalJson = res.json.bind(res);
    res.json = async (data) => {
      try {
        await client.setEx(key, duration, JSON.stringify(data));
        logger.info(`Cache set for key: ${key} with duration: ${duration}s`);
      } catch (error) {
        logger.error(`Failed to set cache for key ${key}: ${error.message}`);
      }
      originalJson(data);
    };

    next();
  };
};

module.exports = cache;
