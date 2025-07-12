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

async function resetBonusCooldown(req, res) {
  try {
    logger.info('🔄 Запрос на сброс кулдауна бонуса получен');

    if (!req.user || !req.user.id) {
      logger.error('❌ Пользователь не авторизован');
      return res.status(401).json({ message: 'Пользователь не авторизован' });
    }

    const userId = req.user.id;
    logger.info(`🔍 Ищем пользователя с ID: ${userId}`);

    const user = await db.User.findByPk(userId);

    if (!user) {
      logger.error(`❌ Пользователь с ID ${userId} не найден`);
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const previousTime = user.next_bonus_available_time;
    logger.info(`📅 Предыдущее время бонуса: ${previousTime}`);

    // Сбрасываем время следующего доступного бонуса
    user.next_bonus_available_time = null;
    await user.save();

    logger.info(`✅ Кулдаун бонуса сброшен для пользователя ${userId}`);

    return res.json({
      message: 'Кулдаун бонуса сброшен успешно',
      user_id: userId,
      previous_next_bonus_time: previousTime,
      current_next_bonus_time: null
    });
  } catch (error) {
    logger.error('❌ Ошибка сброса кулдауна бонуса:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера', error: error.message });
  }
}

module.exports = {
  resetBonusCooldown
};
