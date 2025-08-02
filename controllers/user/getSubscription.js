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
    const daysLeft = expiry ? Math.max(0, Math.floor((expiry - now) / 86400000)) : 0;
    return res.json({
      id: user.subscription_tier,
      name: tier ? tier.name : null,
      expiry_date: expiry,
      days_left: daysLeft,
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
