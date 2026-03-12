const redis = require('redis');
const { logger } = require('../utils/logger');
const { getRedisClientOptions, logRedisReconnectOnce } = require('../config/redisClientOptions');

const skipRedis = process.env.NODE_ENV === 'development' &&
  (process.env.USE_REDIS === 'false' || process.env.SKIP_REDIS === 'true');

let client = null;
if (!skipRedis) {
  client = redis.createClient(getRedisClientOptions());
  client.on('error', (err) => {
    const code = err?.code ?? err?.errno;
    const isConnectionError = code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED' ||
      (typeof err?.message === 'string' && err.message.includes('ECONNRESET'));
    if (isConnectionError) {
      logRedisReconnectOnce('Cache', code || 'ECONNRESET', logger);
    } else {
      logger.error('Redis Client Error', err);
    }
  });
  client.connect().catch(err => {
    logger.error('Ошибка подключения к Redis:', err);
  });
}

const cache = (duration = 300, keyPrefix = 'cache') => {
  return async (req, res, next) => {
    if (!client) return next();
    const cachableRoutes = ['/api/v1/leaderboard', '/api/v1/cases', '/api/v1/achievements', '/api/v1/getProfile'];
    if (!cachableRoutes.some(route => req.path.startsWith(route))) {
      return next();
    }
    const key = `${keyPrefix}:${req.user?.id || 'guest'}:${req.path}:${JSON.stringify(req.query)}`;
    try {
      const cached = await client.get(key);
      if (cached) {
        const data = JSON.parse(cached);
        res.set('X-Cache', 'HIT');
        return res.json(data);
      }
    } catch (error) {
      logger.warn(`Cache error for ${key}: ${error.message}`);
    }
    const originalJson = res.json.bind(res);
    res.json = async (data) => {
      if (res.statusCode === 200) {
        try {
          await client.setEx(key, duration, JSON.stringify(data));
          res.set('X-Cache', 'MISS');
        } catch (error) {
          logger.error(`Failed to cache ${key}: ${error.message}`);
        }
      }
      originalJson(data);
    };
    next();
  };
};

module.exports = cache;
