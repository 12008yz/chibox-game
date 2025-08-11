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

async function getSubscription(req, res) {
  try {
    const userId = req.user.id;
    const user = await db.User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });

    const now = new Date();
    const expiry = user.subscription_expiry_date ? new Date(user.subscription_expiry_date) : null;

    // Используем subscription_days_left из базы данных, но синхронизируем с expiry_date
    let daysLeft = user.subscription_days_left || 0;
    let currentTier = user.subscription_tier || 0;

    // Если есть дни подписки, но нет тарифа, устанавливаем тариф по умолчанию
    if (daysLeft > 0 && currentTier === 0) {
      currentTier = 3; // Устанавливаем Статус++ по умолчанию, если не указан тариф
      logger.info(`Auto-assigned tier 3 for user ${userId} with ${daysLeft} subscription days left`);
    }

    if (expiry && expiry <= now) {
      // Подписка истекла
      daysLeft = 0;

      // Синхронизируем данные в БД если они рассинхронизированы
      if (user.subscription_days_left > 0) {
        user.subscription_days_left = 0;
        await user.save();
        logger.info(`Synced expired subscription for user ${userId}: set days_left to 0`);
      }
    } else if (expiry && daysLeft === 0) {
      // Если expiry_date активна, но days_left = 0, пересчитываем
      const msLeft = expiry.getTime() - now.getTime();
      daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));

      // Обновляем в БД
      user.subscription_days_left = daysLeft;
      await user.save();
      logger.info(`Synced subscription days for user ${userId}: recalculated to ${daysLeft} days`);
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
