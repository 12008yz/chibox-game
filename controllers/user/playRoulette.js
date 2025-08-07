const { User, BonusMiniGameHistory } = require('../../models');
const logger = require('../../utils/logger');

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
      { index: 0, type: 'empty', prize_value: 0 },
      { index: 1, type: 'sub_1_day', prize_value: 1 },
      { index: 2, type: 'empty', prize_value: 0 },
      { index: 3, type: 'empty', prize_value: 0 },
      { index: 4, type: 'sub_3_days', prize_value: 3 },
      { index: 5, type: 'empty', prize_value: 0 },
      { index: 6, type: 'empty', prize_value: 0 },
      { index: 7, type: 'empty', prize_value: 0 },
      { index: 8, type: 'empty', prize_value: 0 }
    ];

    // Генерируем результат с весами: 70% пустые, 20% - 1 день, 10% - 3 дня
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
      game_type: 'roulette',
      game_data: {
        winner_index: winnerIndex,
        prize_type: winnerItem.type,
        prize_value: prizeValue
      },
      prize_type: winnerItem.type,
      prize_value: prizeValue.toString(),
      played_at: now
    });

    logger.info(`User ${userId} played roulette - Winner: ${winnerIndex}, Prize: ${winnerItem.type}`);

    res.json({
      success: true,
      message,
      winner_index: winnerIndex,
      prize_type: winnerItem.type,
      prize_value: prizeValue,
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
