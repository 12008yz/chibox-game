const { User } = require('../../models');
const { logger } = require('../../utils/logger');

// Лимиты попыток для Safe Cracker в зависимости от уровня подписки
const SAFECRACKER_LIMITS = {
  0: 0, // Без подписки - нельзя играть
  1: 3, // Тир 1 - 3 попытки
  2: 4, // Тир 2 - 4 попытки
  3: 5  // Тир 3 - 5 попыток
};

/**
 * Проверяет, нужно ли сбросить счетчик попыток Safe Cracker
 * @param {Date} lastResetDate - Дата последнего сброса
 * @returns {boolean} - true если нужен сброс
 */
function shouldResetSafeCrackerCounter(lastResetDate) {
  if (!lastResetDate) {
    logger.info(`[SAFECRACKER RESET DEBUG] No lastResetDate -> RESET NEEDED`);
    return true;
  }

  const now = new Date();
  const lastReset = new Date(lastResetDate);

  // Сегодняшний сброс в 16:00 МСК (в UTC это 13:00)
  const todayReset = new Date(now);
  todayReset.setUTCHours(13, 0, 0, 0); // 16:00 МСК = 13:00 UTC

  // Если сегодня ещё не наступило время сброса (до 16:00), то используем вчерашний сброс
  if (now < todayReset) {
    todayReset.setDate(todayReset.getDate() - 1);
  }

  logger.info(`[SAFECRACKER RESET DEBUG] Times:`);
  logger.info(`[SAFECRACKER RESET DEBUG] - Current UTC time: ${now.toISOString()}`);
  logger.info(`[SAFECRACKER RESET DEBUG] - Target reset time: ${todayReset.toISOString()}`);
  logger.info(`[SAFECRACKER RESET DEBUG] - Last reset: ${lastReset.toISOString()}`);

  // Нужен сброс, если последний сброс был ДО текущего планового времени сброса
  if (lastReset < todayReset) {
    logger.info(`[SAFECRACKER RESET DEBUG] Last reset before target reset time -> RESET NEEDED`);
    return true;
  }

  logger.info(`[SAFECRACKER RESET DEBUG] Last reset after target reset time -> NO RESET NEEDED`);
  return false;
}

/**
 * Получить статус игры Safe Cracker
 */
const getSafeCrackerStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    // Получаем информацию о пользователе
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    const now = new Date();

    // Проверяем наличие активной подписки
    const hasActiveSubscription = user.subscription_tier > 0 &&
      user.subscription_expiry_date &&
      new Date(user.subscription_expiry_date) > now;

    // Проверяем, нужно ли сбросить счетчик попыток
    const needsReset = shouldResetSafeCrackerCounter(user.last_safecracker_reset);

    if (needsReset && hasActiveSubscription) {
      const limit = SAFECRACKER_LIMITS[user.subscription_tier] || 0;
      logger.info(`[SAFECRACKER] Сброс попыток для пользователя ${user.username}, тир ${user.subscription_tier}, лимит ${limit}`);
      user.game_attempts = limit;

      // Сбрасываем флаг выигрыша (пользователь может выигрывать каждый день)
      user.has_won_safecracker = false;

      // Устанавливаем last_safecracker_reset на время последнего планового сброса (16:00 МСК = 13:00 UTC)
      const resetTime = new Date();
      resetTime.setUTCHours(13, 0, 0, 0);
      // Если текущее время до 16:00 МСК, используем вчерашний сброс
      if (now < resetTime) {
        resetTime.setDate(resetTime.getDate() - 1);
      }
      user.last_safecracker_reset = resetTime;
      await user.save();
    }

    const response = {
      success: true,
      remaining_attempts: user.game_attempts || 0,
      subscription_days: user.subscription_days_left || 0,
      subscription_tier: user.subscription_tier || 0,
      max_attempts: SAFECRACKER_LIMITS[user.subscription_tier] || 0,
      has_won: user.has_won_safecracker || false,
      can_play: !user.has_won_safecracker && (user.game_attempts > 0)
    };

    res.json(response);

  } catch (error) {
    logger.error('Ошибка при получении статуса Safe Cracker:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
};

module.exports = getSafeCrackerStatus;
