const { User, Transaction } = require('../../models');
const { logger } = require('../../utils/logger');

// Конфигурация слотов Plinko (17 слотов)
// Призы: 1 слот = 1 день статуса, 1 слот = 2 дня статуса, остальные = монетки 5-10 руб
const PLINKO_SLOTS = [
  { type: 'coins', value: 8, weight: 10 },     // 8 руб
  { type: 'coins', value: 6, weight: 12 },     // 6 руб
  { type: 'coins', value: 5, weight: 15 },     // 5 руб
  { type: 'coins', value: 7, weight: 12 },     // 7 руб
  { type: 'coins', value: 9, weight: 10 },     // 9 руб
  { type: 'coins', value: 6, weight: 12 },     // 6 руб
  { type: 'coins', value: 10, weight: 8 },     // 10 руб
  { type: 'coins', value: 5, weight: 15 },     // 5 руб
  { type: 'status', days: 1, weight: 3 },      // 1 день статуса - редко
  { type: 'coins', value: 5, weight: 15 },     // 5 руб
  { type: 'coins', value: 10, weight: 8 },     // 10 руб
  { type: 'coins', value: 6, weight: 12 },     // 6 руб
  { type: 'coins', value: 9, weight: 10 },     // 9 руб
  { type: 'coins', value: 7, weight: 12 },     // 7 руб
  { type: 'coins', value: 5, weight: 15 },     // 5 руб
  { type: 'status', days: 2, weight: 2 },      // 2 дня статуса - очень редко
  { type: 'coins', value: 8, weight: 10 }      // 8 руб
];

// Общий вес всех слотов
const calculateTotalWeight = (slots, occupiedSlots) => {
  return slots.reduce((sum, slot, index) => {
    if (occupiedSlots.includes(index)) return sum;
    return sum + slot.weight;
  }, 0);
};

// Кулдаун Plinko в миллисекундах (нет кулдауна для одного броска)
const PLINKO_COOLDOWN_MS = 0;

/**
 * Проверяет, можно ли играть в Plinko (кулдаун 5 секунд)
 * @param {Date} lastPlayTime - Время последней игры
 * @returns {Object} - {canPlay: boolean, nextTime: Date|null}
 */
function canPlayPlinko(lastPlayTime) {
  if (!lastPlayTime) {
    logger.info(`[PLINKO] Нет данных о последней игре -> можно играть`);
    return { canPlay: true, nextTime: null };
  }

  const now = new Date();
  const lastPlay = new Date(lastPlayTime);
  const timeSinceLastPlay = now - lastPlay;

  logger.info(`[PLINKO] Прошло времени с последней игры: ${timeSinceLastPlay}ms (требуется: ${PLINKO_COOLDOWN_MS}ms)`);

  if (timeSinceLastPlay >= PLINKO_COOLDOWN_MS) {
    logger.info(`[PLINKO] Кулдаун прошел -> можно играть`);
    return { canPlay: true, nextTime: null };
  }

  const nextTime = new Date(lastPlay.getTime() + PLINKO_COOLDOWN_MS);
  logger.info(`[PLINKO] Кулдаун активен -> следующая игра в ${nextTime.toISOString()}`);
  return { canPlay: false, nextTime };
}

/**
 * Выбирает случайный слот на основе весов, исключая занятые
 * @param {Array} occupiedSlots - Массив индексов занятых слотов
 * @returns {Object} Выбранный слот с индексом
 */
function selectRandomSlot(occupiedSlots = []) {
  const totalWeight = calculateTotalWeight(PLINKO_SLOTS, occupiedSlots);
  const random = Math.random() * totalWeight;
  let currentWeight = 0;

  logger.info(`Plinko: генерируется случайное число ${random} из общего веса ${totalWeight}, занято слотов: ${occupiedSlots.length}`);

  for (let i = 0; i < PLINKO_SLOTS.length; i++) {
    // Пропускаем занятые слоты
    if (occupiedSlots.includes(i)) {
      continue;
    }

    const slot = PLINKO_SLOTS[i];
    currentWeight += slot.weight;

    if (random <= currentWeight) {
      logger.info(`Plinko: выбран слот ${i}, тип: ${slot.type}, значение: ${slot.value || slot.days}`);
      return { index: i, ...slot };
    }
  }

  // Fallback - выбираем первый свободный слот
  logger.warn(`Plinko: FALLBACK! Ищем первый свободный слот`);
  for (let i = 0; i < PLINKO_SLOTS.length; i++) {
    if (!occupiedSlots.includes(i)) {
      return { index: i, ...PLINKO_SLOTS[i] };
    }
  }

  // Если все слоты заняты - ошибка
  throw new Error('Все слоты Plinko заняты');
}

/**
 * Игра в Plinko
 */
const playPlinko = async (req, res) => {
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
        message: 'Plinko доступна только с активной подпиской'
      });
    }

    // Проверяем кулдаун (5 секунд между играми)
    const { canPlay, nextTime } = canPlayPlinko(user.last_roulette_play);

    if (!canPlay) {
      return res.status(429).json({
        success: false,
        message: 'Подождите 5 секунд перед следующей игрой',
        next_time: nextTime.toISOString()
      });
    }

    // Выбираем случайный слот
    const selectedSlot = selectRandomSlot();

    // Логируем результат
    logger.info(`Plinko - пользователь ${user.username}: слот ${selectedSlot.index}, множитель: ${selectedSlot.multiplier}x`);

    // Обновляем время последней игры
    user.last_roulette_play = now;

    // Применяем приз (добавляем дни подписки в зависимости от множителя)
    // Можно настроить свою логику призов
    let daysWon = 0;

    if (selectedSlot.multiplier >= 100) {
      daysWon = 7; // Джекпот - 7 дней
    } else if (selectedSlot.multiplier >= 40) {
      daysWon = 5; // Отличный результат - 5 дней
    } else if (selectedSlot.multiplier >= 10) {
      daysWon = 3; // Хороший результат - 3 дня
    } else if (selectedSlot.multiplier >= 5) {
      daysWon = 2; // Средний результат - 2 дня
    } else if (selectedSlot.multiplier >= 3) {
      daysWon = 1; // Маленький приз - 1 день
    }
    // Для множителей < 3 дни не добавляются

    if (daysWon > 0) {
      const currentSubscriptionDays = user.subscription_days_left || 0;
      const newSubscriptionDays = currentSubscriptionDays + daysWon;

      logger.info(`Пользователь ${user.username} выиграл ${daysWon} дней подписки в Plinko (множитель ${selectedSlot.multiplier}x). Было: ${currentSubscriptionDays}, станет: ${newSubscriptionDays}`);

      user.subscription_days_left = newSubscriptionDays;
    } else {
      logger.info(`Пользователь ${user.username} получил множитель ${selectedSlot.multiplier}x в Plinko (без призов)`);
    }

    await user.save();

    // Вычисляем время следующей игры (через 5 секунд)
    const nextPlayTime = new Date(now.getTime() + PLINKO_COOLDOWN_MS);

    // Формируем ответ
    const response = {
      success: true,
      message: daysWon > 0
        ? `Поздравляем! Вы выиграли ${daysWon} ${daysWon === 1 ? 'день' : 'дней'} подписки! (${selectedSlot.multiplier}x)`
        : `Множитель: ${selectedSlot.multiplier}x`,
      multiplier: selectedSlot.multiplier,
      slot_index: selectedSlot.index,
      days_won: daysWon,
      next_time: nextPlayTime.toISOString()
    };

    logger.info(`Plinko - ответ пользователю ${user.username}:`, response);

    res.json(response);

  } catch (error) {
    logger.error('Ошибка при игре в Plinko:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
};

module.exports = playPlinko;
