const { User } = require('../../models');
const logger = require('../../utils/logger');

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

// Кулдаун между играми в миллисекундах (30 игр в день = 24 часа / 30 = 48 минут)
const ROULETTE_COOLDOWN = 1 * 6 * 1000;

/**
 * Выбирает случайную секцию на основе весов
 * @returns {Object} Выбранная секция
 */
function selectRandomSegment() {
  const random = Math.random() * TOTAL_WEIGHT;
  let currentWeight = 0;

  for (const segment of ROULETTE_SEGMENTS) {
    currentWeight += segment.weight;
    if (random <= currentWeight) {
      return segment;
    }
  }

  // Fallback на последнюю секцию (не должно происходить)
  return ROULETTE_SEGMENTS[ROULETTE_SEGMENTS.length - 1];
}

/**
 * Вычисляет угол поворота для конкретной секции
 * @param {number} segmentId - ID секции (0-8)
 * @returns {number} Угол поворота в градусах
 */
function calculateRotationAngle(segmentId) {
  // Каждая секция занимает 40 градусов (360 / 9)
  const segmentAngle = 360 / 9;

  // Базовый угол для секции (центр секции)
  const baseAngle = segmentId * segmentAngle + (segmentAngle / 2);

  // Добавляем случайное отклонение в пределах секции
  const randomOffset = (Math.random() - 0.5) * (segmentAngle * 0.8);

  // Добавляем несколько полных оборотов для эффектности (3-5 оборотов)
  const fullRotations = (Math.floor(Math.random() * 3) + 3) * 360;

  return fullRotations + baseAngle + randomOffset;
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

    // Вычисляем угол поворота
    const rotationAngle = calculateRotationAngle(selectedSegment.id);

    // Обновляем время последней игры
    user.last_roulette_play = now;

    // Применяем приз, если есть
    if (selectedSegment.type === 'sub_1_day' || selectedSegment.type === 'sub_2_days') {
      const currentSubscriptionDays = user.subscription_days_left || 0;
      user.subscription_days_left = currentSubscriptionDays + selectedSegment.value;

      logger.info(`Пользователь ${user.username} выиграл ${selectedSegment.value} дней подписки в рулетке`);
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
      rotation_angle: rotationAngle,
      next_time: nextPlayTime.toISOString()
    };

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
