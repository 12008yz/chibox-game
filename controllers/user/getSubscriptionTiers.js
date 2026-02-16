const winston = require('winston');

const subscriptionTiers = {
  1: { id: 1, days: 30, max_daily_cases: 1, bonus_percentage: 2.0, name: 'Статус', price: 10 },
  2: { id: 2, days: 30, max_daily_cases: 1, bonus_percentage: 3.0, name: 'Статус+', price: 10 },
  3: { id: 3, days: 30, max_daily_cases: 1, bonus_percentage: 5.0, name: 'Статус++', price: 10 }
};

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

async function getSubscriptionTiers(req, res) {
  try {
    const tiers = Object.values(subscriptionTiers);

    return res.json({
      success: true,
      data: tiers,
      message: 'Тарифы подписки получены успешно'
    });
  } catch (error) {
    logger.error('Ошибка получения тарифов подписки:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

module.exports = {
  getSubscriptionTiers,
  subscriptionTiers
};
