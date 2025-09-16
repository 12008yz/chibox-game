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
    return true;
  }

  const now = new Date();
  const moscowOffset = 3 * 60; // МСК = UTC+3
  const moscowTime = new Date(now.getTime() + (moscowOffset * 60 * 1000));

  const today = new Date(moscowTime);
  today.setHours(16, 0, 0, 0); // 16:00 МСК сегодня

  const lastReset = new Date(lastResetDate);

  // Если сегодняшний сброс еще не был, и время уже прошло 16:00
  if (moscowTime >= today && lastReset < today) {
    return true;
  }

  // Если прошло больше суток с последнего сброса
  if (moscowTime.getTime() - lastReset.getTime() >= 24 * 60 * 60 * 1000) {
    return true;
  }

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

    // Проверяем, нужно ли сбросить счетчик
    const needsReset = shouldResetSlotCounter(user.last_slot_reset_date);
    if (needsReset) {
      slotsPlayedToday = 0;
    }

    const remaining = Math.max(0, slotLimit - slotsPlayedToday);
    const canPlay = remaining > 0 && user.balance >= 10.00;

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
        cost: 10.00,
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
