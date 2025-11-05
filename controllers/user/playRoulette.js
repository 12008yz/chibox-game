const { User } = require('../../models');
const { logger } = require('../../utils/logger');

// Конфигурация колеса рулетки (9 секций) - оптимизировано для экономики
const ROULETTE_SEGMENTS = [
  { id: 0, type: 'empty', value: 0, weight: 20 },      // Пустая секция
  { id: 1, type: 'sub_1_day', value: 1, weight: 2 },   // 1 день подписки (еще реже)
  { id: 2, type: 'empty', value: 0, weight: 20 },      // Пустая секция
  { id: 3, type: 'empty', value: 0, weight: 20 },      // Пустая секция
  { id: 4, type: 'empty', value: 0, weight: 20 },      // Убрано 2 дня подписки
  { id: 5, type: 'empty', value: 0, weight: 20 },      // Пустая секция
  { id: 6, type: 'empty', value: 0, weight: 20 },      // Пустая секция
  { id: 7, type: 'empty', value: 0, weight: 20 },      // Пустая секция
  { id: 8, type: 'empty', value: 0, weight: 20 }       // Пустая секция
];

// Общий вес всех секций
const TOTAL_WEIGHT = ROULETTE_SEGMENTS.reduce((sum, segment) => sum + segment.weight, 0);

/**
 * Проверяет, нужно ли сбросить счетчик попыток рулетки
 * @param {Date} lastResetDate - Дата последнего сброса
 * @returns {boolean} - true если нужен сброс
 */
function shouldResetRouletteCounter(lastResetDate) {
  if (!lastResetDate) {
    logger.info(`[ROULETTE RESET DEBUG] No lastResetDate -> RESET NEEDED`);
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

  logger.info(`[ROULETTE RESET DEBUG] Times:`);
  logger.info(`[ROULETTE RESET DEBUG] - Current UTC time: ${now.toISOString()}`);
  logger.info(`[ROULETTE RESET DEBUG] - Target reset time: ${todayReset.toISOString()}`);
  logger.info(`[ROULETTE RESET DEBUG] - Last reset: ${lastReset.toISOString()}`);

  // Нужен сброс, если последний сброс был ДО текущего планового времени сброса
  if (lastReset < todayReset) {
    logger.info(`[ROULETTE RESET DEBUG] Last reset before target reset time -> RESET NEEDED`);
    return true;
  }

  logger.info(`[ROULETTE RESET DEBUG] Last reset after target reset time -> NO RESET NEEDED`);
  return false;
}

/**
 * Выбирает случайную секцию на основе весов
 * @returns {Object} Выбранная секция
 */
function selectRandomSegment() {
  const random = Math.random() * TOTAL_WEIGHT;
  let currentWeight = 0;

  logger.info(`Рулетка: генерируется случайное число ${random} из общего веса ${TOTAL_WEIGHT}`);

  for (const segment of ROULETTE_SEGMENTS) {
    currentWeight += segment.weight;
    logger.info(`Рулетка: проверяем секцию ${segment.id} (${segment.type}), текущий вес: ${currentWeight}, случайное число: ${random}`);

    if (random <= currentWeight) {
      logger.info(`Рулетка: выбрана секция ${segment.id} (${segment.type}), значение: ${segment.value}`);
      return segment;
    }
  }

  // Fallback на последнюю секцию (не должно происходить)
  logger.warn(`Рулетка: FALLBACK! Используется последняя секция`);
  return ROULETTE_SEGMENTS[ROULETTE_SEGMENTS.length - 1];
}

/**
 * Игра в рулетку
 */
const playRoulette = async (req, res) => {
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

    // Проверяем наличие активной подписки
    const now = new Date();
    const hasActiveSubscription = user.subscription_tier > 0 &&
      user.subscription_expiry_date &&
      new Date(user.subscription_expiry_date) > now;

    if (!hasActiveSubscription) {
      return res.status(403).json({
        success: false,
        message: 'Рулетка доступна только с активной подпиской'
      });
    }

    // Проверяем, нужно ли сбросить счетчик попыток
    const needsReset = shouldResetRouletteCounter(user.last_roulette_reset);

    if (needsReset) {
      logger.info(`[ROULETTE] Сброс попыток для пользователя ${user.username}`);
      user.roulette_attempts_left = 1; // Всем 1 раз в сутки
      user.last_roulette_reset = new Date();
    }

    // Проверяем, остались ли попытки
    if (user.roulette_attempts_left <= 0) {
      // Вычисляем время следующего сброса
      const nextReset = new Date();
      nextReset.setUTCHours(13, 0, 0, 0); // 16:00 МСК = 13:00 UTC
      if (now >= nextReset) {
        nextReset.setDate(nextReset.getDate() + 1);
      }

      return res.status(429).json({
        success: false,
        message: 'У вас закончились попытки. Следующая попытка будет доступна в 16:00 МСК',
        next_time: nextReset.toISOString()
      });
    }

    // Выбираем случайную секцию
    const selectedSegment = selectRandomSegment();

    // Логируем результат выбора секции
    logger.info(`Рулетка - пользователь ${user.username}: выбрана секция ${selectedSegment.id}, тип: ${selectedSegment.type}, значение: ${selectedSegment.value}`);

    // Уменьшаем количество попыток
    user.roulette_attempts_left -= 1;

    // Применяем приз, если есть
    if (selectedSegment.type === 'sub_1_day' || selectedSegment.type === 'sub_2_days') {
      const currentSubscriptionDays = user.subscription_days_left || 0;
      const newSubscriptionDays = currentSubscriptionDays + selectedSegment.value;

      logger.info(`Пользователь ${user.username} выиграл ${selectedSegment.value} дней подписки в рулетке. Было: ${currentSubscriptionDays}, станет: ${newSubscriptionDays}`);

      user.subscription_days_left = newSubscriptionDays;
    } else {
      logger.info(`Пользователь ${user.username} попал в пустую секцию ${selectedSegment.id} в рулетке`);
    }

    await user.save();

    // Вычисляем время следующего сброса
    const nextReset = new Date();
    nextReset.setUTCHours(13, 0, 0, 0); // 16:00 МСК = 13:00 UTC
    if (now >= nextReset) {
      nextReset.setDate(nextReset.getDate() + 1);
    }

    // Формируем ответ
    const response = {
      success: true,
      message: selectedSegment.type === 'empty'
        ? 'Удачи в следующий раз!'
        : `Поздравляем! Вы выиграли ${selectedSegment.value} ${selectedSegment.value === 1 ? 'день' : 'дня'} подписки!`,
      winner_index: selectedSegment.id,
      prize_type: selectedSegment.type,
      prize_value: selectedSegment.value,
      attempts_left: user.roulette_attempts_left,
      next_time: nextReset.toISOString()
    };

    logger.info(`Рулетка - ответ пользователю ${user.username}:`, response);

    res.json(response);

  } catch (error) {
    logger.error('Ошибка при игре в рулетку:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
};

module.exports = playRoulette;
