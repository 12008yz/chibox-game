const winston = require('winston');

const subscriptionTiers = {
  1: { id: 1, days: 5, max_daily_cases: 1, bonus_percentage: 2.0, name: 'Статус', price: 300 },
  2: { id: 2, days: 5, max_daily_cases: 1, bonus_percentage: 3.0, name: 'Статус+', price: 500 },
  3: { id: 3, days: 5, max_daily_cases: 1, bonus_percentage: 5.0, name: 'Статус++', price: 800 }
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
