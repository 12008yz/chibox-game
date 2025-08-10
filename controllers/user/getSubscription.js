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
    if (!user.subscription_tier) return res.json({ tier: null, expiry_date: null, days_left: 0 });
    const tier = subscriptionTiers[user.subscription_tier];
    const now = new Date();
    const expiry = user.subscription_expiry_date ? new Date(user.subscription_expiry_date) : null;

    // Используем subscription_days_left из базы данных, но синхронизируем с expiry_date
    let daysLeft = user.subscription_days_left || 0;

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

    return res.json({
      id: user.subscription_tier,
      subscription_tier: user.subscription_tier, // Добавляем для совместимости с клиентом
      name: tier ? tier.name : null,
      expiry_date: expiry,
      subscription_expiry_date: expiry, // Добавляем для совместимости
      days_left: daysLeft,
      subscription_days_left: daysLeft, // Добавляем для совместимости
      bonus_percentage: tier ? tier.bonus_percentage : 0,
      max_daily_cases: tier ? tier.max_daily_cases : 0
    });
  } catch (error) {
    logger.error('Ошибка получения подписки:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getSubscription
};
