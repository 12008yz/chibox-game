const db = require('../../models');
const winston = require('winston');

const { subscriptionTiers } = require('./getSubscriptionTiers');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});
const isSubscriptionDebugEnabled = process.env.DEBUG_SUBSCRIPTION === 'true';
function debugLog(...args) {
  if (isSubscriptionDebugEnabled) {
    logger.info(...args);
  }
}

async function getSubscription(req, res) {
  try {
    const userId = req.user.id;
    const user = await db.User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    const now = new Date();
    const expiry = user.subscription_expiry_date ? new Date(user.subscription_expiry_date) : null;

    // Количество дней считаем всегда от точного времени истечения,
    // чтобы не было задержки до следующего запуска cron-скрипта
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    let daysLeft = 0;
    let currentTier = user.subscription_tier || 0;

    // Если есть дни подписки, но нет тарифа, устанавливаем тариф по умолчанию
    if (daysLeft > 0 && currentTier === 0) {
      currentTier = 3; // Устанавливаем Статус++ по умолчанию, если не указан тариф
      debugLog(`Auto-assigned tier 3 for user ${userId} with ${daysLeft} subscription days left`);
    }

    if (expiry && expiry <= now) {
      // Подписка истекла
      daysLeft = 0;

      // Синхронизируем данные в БД если они рассинхронизированы
      if (user.subscription_days_left !== 0) {
        user.subscription_days_left = 0;
        await user.save();
        debugLog(`Synced expired subscription for user ${userId}: set days_left to 0`);
      }
    } else if (expiry && expiry > now) {
      // Всегда пересчитываем дни до окончания «на лету»,
      // чтобы отображение сразу уменьшалось, как только прошли сутки
      const msLeft = expiry.getTime() - now.getTime();
      daysLeft = Math.max(0, Math.ceil(msLeft / MS_PER_DAY));

      // Если в БД другое значение — синхронизируем
      if (user.subscription_days_left !== daysLeft) {
        user.subscription_days_left = daysLeft;
        await user.save();
        debugLog(`Synced subscription days for user ${userId}: recalculated to ${daysLeft} days`);
      }
    } else {
      // Нет даты истечения — безопасности обнуляем
      daysLeft = 0;
      if (user.subscription_days_left !== 0) {
        user.subscription_days_left = 0;
        await user.save();
        debugLog(`Cleared subscription days for user ${userId} because expiry date is missing`);
      }
    }

    // Если нет активной подписки, возвращаем пустые данные
    if (daysLeft <= 0 && currentTier === 0) {
      return res.json({
        success: true,
        data: {
          tier: null,
          expiry_date: null,
          days_left: 0,
          subscription_tier: 0,
          subscription_days_left: 0,
          id: 0,
          name: null,
          bonus_percentage: 0,
          max_daily_cases: 0
        }
      });
    }

    const tier = subscriptionTiers[currentTier];

    return res.json({
      success: true,
      data: {
        id: currentTier,
        subscription_tier: currentTier, // Добавляем для совместимости с клиентом
        name: tier ? tier.name : 'Статус++',
        expiry_date: expiry,
        subscription_expiry_date: expiry, // Добавляем для совместимости
        days_left: daysLeft,
        subscription_days_left: daysLeft, // Добавляем для совместимости
        bonus_percentage: tier ? tier.bonus_percentage : 8.0,
        max_daily_cases: tier ? tier.max_daily_cases : 1
      }
    });
  } catch (error) {
    logger.error('Ошибка получения подписки:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getSubscription
};
