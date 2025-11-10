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

// Кулдаун рулетки в миллисекундах (5 секунд)
const ROULETTE_COOLDOWN_MS = 5 * 1000;

/**
 * Проверяет, можно ли играть в рулетку (кулдаун 5 секунд)
 * @param {Date} lastPlayTime - Время последней игры
 * @returns {Object} - {canPlay: boolean, nextTime: Date|null}
 */
function canPlayRoulette(lastPlayTime) {
  if (!lastPlayTime) {
    logger.info(`[ROULETTE] Нет данных о последней игре -> можно играть`);
    return { canPlay: true, nextTime: null };
  }

  const now = new Date();
  const lastPlay = new Date(lastPlayTime);
  const timeSinceLastPlay = now - lastPlay;

  logger.info(`[ROULETTE] Прошло времени с последней игры: ${timeSinceLastPlay}ms (требуется: ${ROULETTE_COOLDOWN_MS}ms)`);

  if (timeSinceLastPlay >= ROULETTE_COOLDOWN_MS) {
    logger.info(`[ROULETTE] Кулдаун прошел -> можно играть`);
    return { canPlay: true, nextTime: null };
  }

  const nextTime = new Date(lastPlay.getTime() + ROULETTE_COOLDOWN_MS);
  logger.info(`[ROULETTE] Кулдаун активен -> следующая игра в ${nextTime.toISOString()}`);
  return { canPlay: false, nextTime };
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

    // Проверяем кулдаун (5 секунд между играми)
    const { canPlay, nextTime } = canPlayRoulette(user.last_roulette_play);

    if (!canPlay) {
      return res.status(429).json({
        success: false,
        message: 'Подождите 5 секунд перед следующей игрой',
        next_time: nextTime.toISOString()
      });
    }

    // Выбираем случайную секцию
    const selectedSegment = selectRandomSegment();

    // Логируем результат выбора секции
    logger.info(`Рулетка - пользователь ${user.username}: выбрана секция ${selectedSegment.id}, тип: ${selectedSegment.type}, значение: ${selectedSegment.value}`);

    // Обновляем время последней игры
    user.last_roulette_play = now;

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

    // Вычисляем время следующей игры (через 5 секунд)
    const nextPlayTime = new Date(now.getTime() + ROULETTE_COOLDOWN_MS);

    // Формируем ответ
    const response = {
      success: true,
      message: selectedSegment.type === 'empty'
        ? 'Удачи в следующий раз!'
        : `Поздравляем! Вы выиграли ${selectedSegment.value} ${selectedSegment.value === 1 ? 'день' : 'дня'} подписки!`,
      winner_index: selectedSegment.id,
      prize_type: selectedSegment.type,
      prize_value: selectedSegment.value,
      next_time: nextPlayTime.toISOString()
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
