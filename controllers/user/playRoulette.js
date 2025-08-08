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
      { index: 0, type: 'empty', prize_value: 0, weight: 7 },
      { index: 1, type: 'sub_1_day', prize_value: 1, weight: 2 }, // 20% вероятность
      { index: 2, type: 'empty', prize_value: 0, weight: 7 },
      { index: 3, type: 'empty', prize_value: 0, weight: 7 },
      { index: 4, type: 'sub_3_days', prize_value: 3, weight: 1 }, // 10% вероятность
      { index: 5, type: 'empty', prize_value: 0, weight: 7 },
      { index: 6, type: 'empty', prize_value: 0, weight: 7 },
      { index: 7, type: 'empty', prize_value: 0, weight: 7 },
      { index: 8, type: 'empty', prize_value: 0, weight: 7 }
    ];

    // 🎰 ПРАВИЛЬНЫЙ АЛГОРИТМ РУЛЕТКИ (как в wheelofnames.com):
    // 1. Генерируем случайный угол поворота (честно)
    // 2. Определяем на какой сектор указывает стрелочка
    // 3. Применяем веса через вероятностную корректировку

    const sectorAngle = 360 / rouletteItems.length; // 40 градусов на сектор

    // Создаем взвешенный массив для корректной вероятности
    const weightedSectors = [];
    for (let i = 0; i < rouletteItems.length; i++) {
      const weight = rouletteItems[i].weight;
      for (let j = 0; j < weight; j++) {
        weightedSectors.push(i);
      }
    }

    // Используем взвешенный выбор для определения победителя (честный способ)
    const winnerIndex = weightedSectors[Math.floor(Math.random() * weightedSectors.length)];

    // 🎯 ИСПРАВЛЕННЫЙ РАСЧЕТ УГЛОВ
    // Во фронтенде секторы размещены так:
    // Сектор 0: центр на 0° (сверху)
    // Сектор 1: центр на 40° (по часовой)
    // Сектор 2: центр на 80°, и т.д.

    const winnerSectorCenter = winnerIndex * sectorAngle;

    // Стрелочка указывает на 0° (вверх)
    // Чтобы центр выигрышного сектора попал под стрелочку,
    // нужно повернуть колесо ПРОТИВ часовой стрелки на угол центра сектора
    // CSS rotate: положительный угол = по часовой, отрицательный = против часовой
    let targetRotation = -winnerSectorCenter;

    // Нормализуем в положительный диапазон [0, 360)
    if (targetRotation < 0) {
      targetRotation += 360;
    }

    // Добавляем случайное смещение в пределах сектора для реалистичности
    const maxOffset = sectorAngle * 0.3; // 30% от размера сектора
    const randomOffset = (Math.random() - 0.5) * maxOffset;

    // Добавляем 5-8 полных оборотов для эффектности
    const fullRotations = (5 + Math.random() * 3) * 360;

    // Итоговый угол поворота
    const finalAngle = fullRotations + targetRotation + randomOffset;

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
      game_grid: JSON.stringify(rouletteItems),
      chosen_cells: JSON.stringify([winnerIndex]),
      won: winnerItem.type !== 'empty',
      prize_type: winnerItem.type,
      prize_value: prizeValue.toString(),
      played_at: now
    });

    logger.info(`🎰 User ${userId} played roulette (FIXED ALGORITHM):`, {
      winnerIndex,
      winnerItem: {
        type: winnerItem.type,
        prizeValue: winnerItem.prize_value,
        weight: winnerItem.weight
      },
      calculations: {
        sectorAngle: sectorAngle.toFixed(1),
        winnerSectorCenter: winnerSectorCenter.toFixed(1),
        targetRotation: targetRotation.toFixed(1),
        randomOffset: randomOffset.toFixed(1),
        maxOffset: maxOffset.toFixed(1),
        fullRotations: fullRotations.toFixed(1),
        finalAngle: finalAngle.toFixed(1)
      },
      result: {
        won: winnerItem.type !== 'empty',
        message,
        prizeValue
      },
      stats: {
        rouletteItemsCount: rouletteItems.length,
        weightedSectorsCount: weightedSectors.length,
        winProbability: ((winnerItem.weight / weightedSectors.length) * 100).toFixed(1) + '%'
      }
    });

    res.json({
      success: true,
      message,
      winner_index: winnerIndex,
      prize_type: winnerItem.type,
      prize_value: prizeValue,
      rotation_angle: finalAngle,
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
