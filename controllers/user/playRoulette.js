const { User, BonusMiniGameHistory } = require('../../models');
const { logger } = require('../../utils/logger');

const playRoulette = async (req, res) => {
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

    // Проверяем, можно ли играть в рулетку
    const now = new Date();
    const nextBonusTime = user.next_bonus_time ? new Date(user.next_bonus_time) : null;

    if (nextBonusTime && now < nextBonusTime) {
      const timeLeft = Math.ceil((nextBonusTime - now) / 1000);
      return res.status(400).json({
        success: false,
        message: 'Рулетка пока недоступна',
        time_until_next_seconds: timeLeft
      });
    }

    // Определяем элементы рулетки (9 позиций, 2 с подарками)
    const rouletteItems = [
      { index: 0, type: 'empty', prize_value: 0, weight: 1 },
      { index: 1, type: 'sub_1_day', prize_value: 1, weight: 0.286 }, // ~20% вероятность (2/7)
      { index: 2, type: 'empty', prize_value: 0, weight: 1 },
      { index: 3, type: 'empty', prize_value: 0, weight: 1 },
      { index: 4, type: 'sub_3_days', prize_value: 3, weight: 0.143 }, // ~10% вероятность (1/7)
      { index: 5, type: 'empty', prize_value: 0, weight: 1 },
      { index: 6, type: 'empty', prize_value: 0, weight: 1 },
      { index: 7, type: 'empty', prize_value: 0, weight: 1 },
      { index: 8, type: 'empty', prize_value: 0, weight: 1 }
    ];

    // Создаем взвешенный массив секторов для правильной вероятности
    const weightedSectors = [];
    for (let i = 0; i < rouletteItems.length; i++) {
      const weight = rouletteItems[i].weight;
      const repeats = weight >= 1 ? Math.round(weight) : Math.round(1 / weight);

      if (weight >= 1) {
        // Если вес >= 1, добавляем сектор weight раз
        for (let j = 0; j < repeats; j++) {
          weightedSectors.push(i);
        }
      } else {
        // Если вес < 1, добавляем сектор реже
        if (Math.random() < weight * repeats) {
          weightedSectors.push(i);
        }
      }
    }

    // Если weightedSectors пуст или нужно гарантировать результат, используем альтернативный метод
    if (weightedSectors.length === 0) {
      // Альтернативный метод с прямой вероятностью
      const random = Math.random();
      let winnerIndex;

      if (random < 0.1) {
        winnerIndex = 4; // 3 дня подписки (10% шанс)
      } else if (random < 0.3) {
        winnerIndex = 1; // 1 день подписки (20% шанс)
      } else {
        // Выбираем случайный пустой слот (70% шанс)
        const emptySlots = [0, 2, 3, 5, 6, 7, 8];
        winnerIndex = emptySlots[Math.floor(Math.random() * emptySlots.length)];
      }
    } else {
      // Выбираем случайный элемент из взвешенного массива
      winnerIndex = weightedSectors[Math.floor(Math.random() * weightedSectors.length)];
    }

    // Генерируем реалистичный угол поворота для точного попадания
    const sectorAngle = 360 / rouletteItems.length; // 40 градусов на сектор (9 секторов)

    // ИСПРАВЛЕННАЯ ЛОГИКА:
    // Указатель фиксированный вверху (0°), колесо вращается
    // В клиентской части сектор 0 находится вверху благодаря startAngle = index * sectorAngle - 90
    // Чтобы нужный сектор оказался под указателем, используем формулу:
    // Угол = -(winnerIndex * sectorAngle) + смещение к центру сектора

    // Смещаем к центру сектора (половина сектора)
    const sectorCenterOffset = sectorAngle / 2;

    // Базовый угол для попадания на нужный сектор
    // ПРАВИЛЬНАЯ ЛОГИКА: Рассчитываем позицию центра нужного сектора
    const sectorStartAngle = winnerIndex * sectorAngle - 90; // начало сектора
    const sectorCenterAngle = sectorStartAngle + (sectorAngle / 2); // центр сектора

    // Чтобы указатель (0°) попал на центр сектора, колесо должно повернуться на:
    const targetAngle = -sectorCenterAngle;

    // Добавляем 5-8 полных оборотов для красивой анимации
    const fullRotations = 5 + Math.random() * 3; // 5-8 оборотов
    const fullRotationsDegrees = fullRotations * 360;

    // Небольшое случайное смещение внутри сектора (±5° максимум)
    const maxOffset = Math.min(sectorAngle * 0.2, 5); // Не более 20% сектора или 5°
    const randomOffset = (Math.random() - 0.5) * 2 * maxOffset;

    // Итоговый угол для анимации
    const finalAngle = fullRotationsDegrees + targetAngle + randomOffset;

    const winnerItem = rouletteItems[winnerIndex];
    let message = '';
    let prizeValue = 0;

    // Обрабатываем выигрыш
    if (winnerItem.type === 'sub_1_day') {
      user.subscription_days_left = (user.subscription_days_left || 0) + 1;
      message = 'Поздравляем! Вы выиграли 1 день подписки!';
      prizeValue = 1;
    } else if (winnerItem.type === 'sub_3_days') {
      user.subscription_days_left = (user.subscription_days_left || 0) + 3;
      message = 'Поздравляем! Вы выиграли 3 дня подписки!';
      prizeValue = 3;
    } else {
      message = 'В этот раз не повезло. Попробуйте завтра!';
      prizeValue = 0;
    }

    // Устанавливаем следующее время доступности рулетки (24 часа)
    const nextTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    user.next_bonus_time = nextTime;

    await user.save();

    // Записываем в историю
    await BonusMiniGameHistory.create({
      user_id: userId,
      game_grid: JSON.stringify(rouletteItems), // Сохраняем структуру рулетки
      chosen_cells: JSON.stringify([winnerIndex]), // Сохраняем выбранный сектор
      won: winnerItem.type !== 'empty', // Выиграл, если не пустой сектор
      prize_type: winnerItem.type,
      prize_value: prizeValue.toString(),
      played_at: now
    });

    logger.info(`User ${userId} played roulette - Winner: ${winnerIndex}, Prize: ${winnerItem.type}, SectorStart: ${sectorStartAngle}°, SectorCenter: ${sectorCenterAngle}°, TargetAngle: ${targetAngle}°, FinalAngle: ${finalAngle}°, FullRotations: ${fullRotations}`);

    res.json({
      success: true,
      message,
      winner_index: winnerIndex,
      prize_type: winnerItem.type,
      prize_value: prizeValue,
      rotation_angle: finalAngle, // Добавляем точный угол поворота
      next_time: nextTime.toISOString()
    });

  } catch (error) {
    logger.error('Error in playRoulette:', error);
    res.status(500).json({
      success: false,
      message: 'Произошла ошибка при игре в рулетку'
    });
  }
};

module.exports = playRoulette;
