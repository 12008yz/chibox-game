const db = require('../../models');
const winston = require('winston');

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

async function getBonusStatus(req, res) {
  try {
    const userId = req.user.id;
    const user = await db.User.findByPk(userId);
    const now = new Date();

    // Проверяем статус подписки
    const hasActiveSubscription = user.subscription_expiry_date && user.subscription_expiry_date > now;
    const cooldownHours = hasActiveSubscription ? 24 : 48;

    // Проверяем доступность бонуса
    const isAvailable = !user.next_bonus_available_time || user.next_bonus_available_time <= now;

    // Рассчитываем время до следующего бонуса
    let timeUntilNext = null;
    if (user.next_bonus_available_time && user.next_bonus_available_time > now) {
      timeUntilNext = Math.ceil((user.next_bonus_available_time.getTime() - now.getTime()) / 1000); // секунды
    }

    return res.json({
      is_available: isAvailable,
      next_bonus_available_time: user.next_bonus_available_time,
      time_until_next_seconds: timeUntilNext,
      lifetime_bonuses_claimed: user.lifetime_bonuses_claimed,
      last_bonus_date: user.last_bonus_date,
      has_active_subscription: hasActiveSubscription,
      cooldown_hours: cooldownHours,
      subscription_expiry: user.subscription_expiry_date
    });
  } catch (error) {
    logger.error('Ошибка проверки статуса бонуса:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getBonusStatus
};
