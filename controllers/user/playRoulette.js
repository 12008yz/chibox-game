const { User } = require('../../models');
const { logger } = require('../../utils/logger');

// Конфигурация колеса рулетки (9 секций)
const ROULETTE_SEGMENTS = [
  { id: 0, type: 'empty', value: 0, weight: 15 },      // Пустая секция
  { id: 1, type: 'sub_1_day', value: 1, weight: 8 },   // 1 день подписки (менее вероятно)
  { id: 2, type: 'empty', value: 0, weight: 15 },      // Пустая секция
  { id: 3, type: 'empty', value: 0, weight: 15 },      // Пустая секция
  { id: 4, type: 'sub_2_days', value: 2, weight: 4 },  // 2 дня подписки (редко)
  { id: 5, type: 'empty', value: 0, weight: 15 },      // Пустая секция
  { id: 6, type: 'empty', value: 0, weight: 15 },      // Пустая секция
  { id: 7, type: 'empty', value: 0, weight: 15 },      // Пустая секция
  { id: 8, type: 'empty', value: 0, weight: 15 }       // Пустая секция
];

// Общий вес всех секций
const TOTAL_WEIGHT = ROULETTE_SEGMENTS.reduce((sum, segment) => sum + segment.weight, 0);

// Кулдаун между играми в миллисекундах (6 минут)
const ROULETTE_COOLDOWN = 6 * 60 * 1000;

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

    // Проверяем кулдаун
    const now = new Date();
    const lastRoulettePlay = user.last_roulette_play || new Date(0);
    const timeSinceLastPlay = now.getTime() - lastRoulettePlay.getTime();

    if (timeSinceLastPlay < ROULETTE_COOLDOWN) {
      const timeRemaining = ROULETTE_COOLDOWN - timeSinceLastPlay;
      const minutesRemaining = Math.ceil(timeRemaining / (60 * 1000));

      return res.status(429).json({
        success: false,
        message: `Следующая игра в рулетку будет доступна через ${minutesRemaining} минут`,
        next_time: new Date(lastRoulettePlay.getTime() + ROULETTE_COOLDOWN).toISOString()
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

    // Вычисляем время следующей игры
    const nextPlayTime = new Date(now.getTime() + ROULETTE_COOLDOWN);

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
