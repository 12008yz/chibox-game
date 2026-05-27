const redis = require('redis');
const { logger } = require('../utils/logger');
const { PAID_CASE_DROP_BONUS_CAP, TOTAL_DROP_BONUS_CAP } = require('../utils/userBonusCalculator');

const REDIS_KEY_PREFIX = 'drop_pity:';
const memoryStore = new Map();

let redisClient = null;
let redisConnectAttempted = false;

const skipRedis =
  process.env.NODE_ENV === 'development' &&
  (process.env.USE_REDIS === 'false' || process.env.SKIP_REDIS === 'true');

function parseEnvBool(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return raw === 'true' || raw === '1';
}

function parseEnvInt(name, defaultValue) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseEnvFloat(name, defaultValue) {
  const parsed = parseFloat(process.env[name]);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function getConfig() {
  return {
    enabled: parseEnvBool('DROP_SOFT_PITY_ENABLED', false),
    paidOnly: parseEnvBool('DROP_SOFT_PITY_PAID_ONLY', true),
    threshold: parseEnvInt('DROP_SOFT_PITY_THRESHOLD', 5),
    minWinRatio: parseEnvFloat('DROP_SOFT_PITY_MIN_WIN_RATIO', 0.85),
    boostPercent: parseEnvFloat('DROP_SOFT_PITY_BOOST_PERCENT', 3),
    maxBoostPercent: parseEnvFloat('DROP_SOFT_PITY_MAX_BOOST_PERCENT', 5),
    durationOpens: parseEnvInt('DROP_SOFT_PITY_DURATION_OPENS', 2),
    sessionTtlSec: parseEnvInt('DROP_SOFT_PITY_SESSION_TTL_HOURS', 24) * 3600
  };
}

function emptyState() {
  return { dryStreak: 0, boostedOpensRemaining: 0 };
}

function isQualifyingWin(itemPrice, casePrice, minWinRatio) {
  const price = parseFloat(itemPrice) || 0;
  const caseCost = parseFloat(casePrice) || 0;
  return caseCost > 0 && price >= caseCost * minWinRatio;
}

async function getRedisClient() {
  if (skipRedis) return null;
  if (redisClient?.isOpen) return redisClient;
  if (redisConnectAttempted && !redisClient?.isOpen) return null;

  redisConnectAttempted = true;
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
    });
    redisClient.on('error', (err) => {
      logger.warn('[softPity] Redis error', { message: err.message });
    });
    await redisClient.connect();
    return redisClient;
  } catch (err) {
    logger.warn('[softPity] Redis unavailable, using in-memory fallback', { message: err.message });
    redisClient = null;
    return null;
  }
}

async function loadState(userId) {
  const client = await getRedisClient();
  const key = `${REDIS_KEY_PREFIX}${userId}`;

  if (client) {
    try {
      const raw = await client.get(key);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      return {
        dryStreak: Math.max(0, parseInt(parsed.dryStreak, 10) || 0),
        boostedOpensRemaining: Math.max(0, parseInt(parsed.boostedOpensRemaining, 10) || 0)
      };
    } catch (err) {
      logger.warn('[softPity] loadState redis failed', { userId, message: err.message });
    }
  }

  const entry = memoryStore.get(userId);
  if (!entry || entry.expiresAt <= Date.now()) {
    memoryStore.delete(userId);
    return emptyState();
  }
  return entry.state;
}

async function saveState(userId, state) {
  const config = getConfig();
  const client = await getRedisClient();
  const payload = JSON.stringify({
    dryStreak: state.dryStreak,
    boostedOpensRemaining: state.boostedOpensRemaining
  });
  const key = `${REDIS_KEY_PREFIX}${userId}`;

  if (client) {
    try {
      await client.setEx(key, config.sessionTtlSec, payload);
      return;
    } catch (err) {
      logger.warn('[softPity] saveState redis failed', { userId, message: err.message });
    }
  }

  memoryStore.set(userId, {
    state,
    expiresAt: Date.now() + config.sessionTtlSec * 1000
  });
}

/**
 * Перед открытием: сколько % pity добавить к бонусу весов.
 */
async function prepareForOpen(userId, { isPaid = false, casePrice = 0 } = {}) {
  const config = getConfig();
  if (!config.enabled || !userId) {
    return { pityBonusPercent: 0, meta: null };
  }
  if (config.paidOnly && !isPaid) {
    return { pityBonusPercent: 0, meta: null };
  }

  const state = await loadState(userId);
  const pityBonusPercent =
    state.boostedOpensRemaining > 0
      ? Math.min(config.boostPercent, config.maxBoostPercent)
      : 0;

  return {
    pityBonusPercent,
    meta: {
      dryStreak: state.dryStreak,
      boostedOpensRemaining: state.boostedOpensRemaining,
      pityActive: pityBonusPercent > 0
    }
  };
}

function capEffectiveBonus(userDropBonus, pityBonusPercent, isPaid) {
  const base = parseFloat(userDropBonus) || 0;
  const pity = parseFloat(pityBonusPercent) || 0;
  const config = getConfig();

  if (isPaid) {
    const maxTotal = PAID_CASE_DROP_BONUS_CAP + config.maxBoostPercent;
    return Math.min(base + pity, maxTotal);
  }
  return Math.min(base + pity, TOTAL_DROP_BONUS_CAP);
}

/**
 * После успешного открытия: обновить серию проигрышей / оставшиеся pity-открытия.
 */
async function completeOpen(
  userId,
  { isPaid = false, casePrice = 0, itemPrice = 0, pityWasActive = false } = {}
) {
  const config = getConfig();
  if (!config.enabled || !userId) return null;
  if (config.paidOnly && !isPaid) return null;

  const caseCost = parseFloat(casePrice) || 0;
  if (caseCost <= 0) {
    return null;
  }

  const state = await loadState(userId);
  const won = isQualifyingWin(itemPrice, casePrice, config.minWinRatio);

  if (pityWasActive) {
    state.boostedOpensRemaining = Math.max(0, state.boostedOpensRemaining - 1);
    if (won) {
      state.dryStreak = 0;
    }
  } else if (won) {
    state.dryStreak = 0;
  } else {
    state.dryStreak += 1;
    if (state.dryStreak >= config.threshold) {
      state.boostedOpensRemaining = config.durationOpens;
      state.dryStreak = 0;
    }
  }

  await saveState(userId, state);
  return state;
}

module.exports = {
  getConfig,
  prepareForOpen,
  capEffectiveBonus,
  completeOpen,
  isQualifyingWin
};
