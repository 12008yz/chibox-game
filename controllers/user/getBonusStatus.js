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
    // ИЗМЕНЕНО: Cooldown теперь 10 секунд вместо 24/48 часов
    const cooldownHours = 10 / 3600; // 10 секунд в часах для совместимости

    // Проверяем доступность бонуса
    const isAvailable = !user.next_bonus_available_time || user.next_bonus_available_time <= now;

    // Рассчитываем время до следующего бонуса
    let timeUntilNext = null;
    if (user.next_bonus_available_time && user.next_bonus_available_time > now) {
      timeUntilNext = Math.ceil((user.next_bonus_available_time.getTime() - now.getTime()) / 1000); // секунды
    }

    // Добавляем отладочную информацию
    logger.info(`Статус бонуса для пользователя ${userId}: доступен=${isAvailable}, следующий_бонус=${user.next_bonus_available_time}, сейчас=${now}`);

    return res.json({
      is_available: isAvailable,
      next_bonus_available_time: user.next_bonus_available_time,
      time_until_next_seconds: timeUntilNext,
      lifetime_bonuses_claimed: user.lifetime_bonuses_claimed,
      last_bonus_date: user.last_bonus_date,
      has_active_subscription: hasActiveSubscription,
      cooldown_hours: cooldownHours,
      subscription_expiry: user.subscription_expiry_date,
      // Отладочная информация
      debug_info: {
        current_time: now.toISOString(),
        next_bonus_time: user.next_bonus_available_time ? user.next_bonus_available_time.toISOString() : null,
        is_time_check_passed: !user.next_bonus_available_time || user.next_bonus_available_time <= now
      }
    });
  } catch (error) {
    logger.error('Ошибка проверки статуса бонуса:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getBonusStatus
};
