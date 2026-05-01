/**
 * Серия «дней подряд с активным статусом» для достижений subscription_days.
 * Источник истины: дата начала текущей непрерывной серии + факт активной подписки (tier + expiry > now).
 */

function startOfUtcDay(d) {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
}

/** Для поля DATEONLY в БД — без сдвига из‑за локальной таймзоны Node */
function toDateOnlyUtcString(d) {
  const x = new Date(d);
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, '0');
  const day = String(x.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function snapshotSubscriptionPrior(user) {
  return {
    tier: user.subscription_tier || 0,
    expiry: user.subscription_expiry_date ? new Date(user.subscription_expiry_date.getTime()) : null,
    purchaseDate: user.subscription_purchase_date ? new Date(user.subscription_purchase_date.getTime()) : null
  };
}

/**
 * Вызывать после изменения subscription_tier / subscription_expiry_date / purchase_date.
 * @param {import('sequelize').Model} user - модель User
 * @param {Date} now
 * @param {{ tier: number, expiry: Date|null, purchaseDate: Date|null }} prior - снимок до изменений
 */
function normalizeSubscriptionStreakAfterChange(user, now, prior) {
  const expiry = user.subscription_expiry_date ? new Date(user.subscription_expiry_date) : null;
  const active = (user.subscription_tier || 0) > 0 && expiry && expiry > now;

  if (!active) {
    user.subscription_streak_start_date = null;
    return;
  }

  const wasActive = (prior.tier || 0) > 0 && prior.expiry && new Date(prior.expiry) > now;

  if (wasActive) {
    if (!user.subscription_streak_start_date) {
      user.subscription_streak_start_date = toDateOnlyUtcString(prior.purchaseDate || now);
    }
  } else {
    user.subscription_streak_start_date = toDateOnlyUtcString(now);
  }
}

/**
 * Число календарных дней подряд с активной подпиской от начала серии до сегодня (UTC), не дальше дня окончания.
 */
function computeSubscriptionStreakDays(user) {
  const now = new Date();
  const tier = user.subscription_tier || 0;
  if (tier < 1) return 0;

  const expiry = user.subscription_expiry_date ? new Date(user.subscription_expiry_date) : null;
  if (!expiry || expiry <= now) return 0;

  const startRaw = user.subscription_streak_start_date || user.subscription_purchase_date;
  if (!startRaw) return 0;

  const start = startOfUtcDay(new Date(startRaw));
  const today = startOfUtcDay(now);
  const expiryDay = startOfUtcDay(expiry);

  if (start > today) return 0;
  const end = today <= expiryDay ? today : expiryDay;
  if (start > end) return 0;

  return Math.floor((end - start) / 86400000) + 1;
}

module.exports = {
  startOfUtcDay,
  toDateOnlyUtcString,
  snapshotSubscriptionPrior,
  normalizeSubscriptionStreakAfterChange,
  computeSubscriptionStreakDays
};
