const { User } = require('../../models');
const { logger } = require('../../utils/logger');

// Лимиты спинов по уровню подписки
const SLOT_LIMITS = {
  0: 0, // Без подписки - запрещено
  1: 1, // Статус - 1 спин в день
  2: 2, // Статус+ - 2 спина в день
  3: 3  // Статус++ - 3 спина в день
};

/**
 * Проверяет, нужно ли сбросить счетчик спинов (каждый день в 16:00 МСК)
 */
function shouldResetSlotCounter(lastResetDate) {
  if (!lastResetDate) {
    logger.info(`[SLOT RESET DEBUG] No lastResetDate -> RESET NEEDED`);
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

  logger.info(`[SLOT RESET DEBUG] Times:`);
  logger.info(`[SLOT RESET DEBUG] - Current UTC time: ${now.toISOString()}`);
  logger.info(`[SLOT RESET DEBUG] - Target reset time: ${todayReset.toISOString()}`);
  logger.info(`[SLOT RESET DEBUG] - Last reset: ${lastReset.toISOString()}`);

  // ПРОСТАЯ И ПРАВИЛЬНАЯ ЛОГИКА:
  // Нужен сброс, если последний сброс был ДО текущего планового времени сброса
  if (lastReset < todayReset) {
    logger.info(`[SLOT RESET DEBUG] Last reset before target reset time -> RESET NEEDED`);
    return true;
  }

  logger.info(`[SLOT RESET DEBUG] Last reset after target reset time -> NO RESET NEEDED`);
  return false;
}

/**
 * Получает максимальное количество спинов для уровня подписки
 */
function getSlotLimit(subscriptionTier) {
  return SLOT_LIMITS[subscriptionTier] || 0;
}

/**
 * Вычисляет время следующего сброса в МСК
 */
function getNextResetTime() {
  const now = new Date();
  const moscowOffset = 3 * 60; // МСК = UTC+3
  const moscowTime = new Date(now.getTime() + (moscowOffset * 60 * 1000));

  const nextReset = new Date(moscowTime);
  nextReset.setHours(16, 0, 0, 0); // 16:00 МСК

  // Если сегодня 16:00 уже прошло, переходим на завтрашний день
  if (moscowTime >= nextReset) {
    nextReset.setDate(nextReset.getDate() + 1);
  }

  return nextReset;
}

/**
 * Получает статус слот-машины для пользователя
 */
const getSlotStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    // Получаем пользователя
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    const slotLimit = getSlotLimit(user.subscription_tier);
    let slotsPlayedToday = user.slots_played_today || 0;

    // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ
    logger.info(`[SLOT STATUS DEBUG] User ${userId}:`);
    logger.info(`[SLOT STATUS DEBUG] - subscription_tier: ${user.subscription_tier}`);
    logger.info(`[SLOT STATUS DEBUG] - slots_played_today: ${user.slots_played_today}`);
    logger.info(`[SLOT STATUS DEBUG] - last_slot_reset_date: ${user.last_slot_reset_date}`);
    logger.info(`[SLOT STATUS DEBUG] - slot limit: ${slotLimit}`);

    // ИСПРАВЛЕНИЕ: Проверяем, нужно ли сбросить счетчик И ОБНОВЛЯЕМ БД
    const needsReset = shouldResetSlotCounter(user.last_slot_reset_date);
    logger.info(`[SLOT STATUS DEBUG] - needs reset: ${needsReset}`);

    if (needsReset) {
      slotsPlayedToday = 0;
      // Обновляем базу данных
      await user.update({
        slots_played_today: 0,
        last_slot_reset_date: new Date()
      });
      logger.info(`[SLOT STATUS DEBUG] Reset slot counter for user ${userId}: 0/${slotLimit}`);
    }

    const remaining = Math.max(0, slotLimit - slotsPlayedToday);
    // ИСПРАВЛЕНИЕ: Игра бесплатная, убираем проверку баланса
    const canPlay = remaining > 0 && user.subscription_tier > 0;

    logger.info(`[SLOT STATUS DEBUG] - final status: ${slotsPlayedToday}/${slotLimit}, remaining: ${remaining}, canPlay: ${canPlay}`);

    // Получаем названия уровней подписки
    const subscriptionNames = {
      0: 'Без подписки',
      1: 'Статус',
      2: 'Статус+',
      3: 'Статус++'
    };

    res.json({
      success: true,
      data: {
        subscriptionTier: user.subscription_tier,
        subscriptionName: subscriptionNames[user.subscription_tier],
        limit: slotLimit,
        used: slotsPlayedToday,
        remaining: remaining,
        canPlay: canPlay,
        cost: 0.00,
        balance: parseFloat(user.balance || 0),
        nextResetTime: getNextResetTime().toISOString(),
        nextResetTimeFormatted: getNextResetTime().toLocaleString('ru-RU', {
          timeZone: 'Europe/Moscow',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        hasSubscription: user.subscription_tier > 0,
        needsReset: needsReset
      }
    });

  } catch (error) {
    logger.error('Error in getSlotStatus:', error);

    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
};

module.exports = getSlotStatus;
