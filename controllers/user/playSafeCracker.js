const { User, Transaction } = require('../../models');
const { logger } = require('../../utils/logger');

// Кулдаун Safe Cracker в миллисекундах (нет кулдауна)
const SAFE_CRACKER_COOLDOWN_MS = 0;

/**
 * Генерирует случайный 3-значный код
 */
function generateRandomCode() {
  return Array.from({ length: 3 }, () => Math.floor(Math.random() * 10));
}

/**
 * Подсчитывает количество совпадений цифр
 */
function countMatches(secretCode, userCode) {
  let matches = 0;
  for (let i = 0; i < 3; i++) {
    if (secretCode[i] === userCode[i]) {
      matches++;
    }
  }
  return matches;
}

/**
 * Определяет приз на основе количества совпадений
 * @param {number} matches - Количество совпадений
 * @returns {Object} - {type: string, days: number}
 */
function determinePrize(matches) {
  if (matches === 3) {
    // 3 совпадения = 5 дней подписки (1% шанс)
    return { type: 'subscription', days: 5 };
  } else if (matches === 2) {
    // 2 совпадения = 1 день подписки (15% шанс)
    return { type: 'subscription', days: 1 };
  } else {
    // Нет совпадений или 1 совпадение - без призов
    return { type: 'none', days: 0 };
  }
}

/**
 * Симулирует взлом сейфа с учетом настроенных шансов
 */
function simulateSafeCracker() {
  const random = Math.random() * 100;

  if (random < 1) {
    // 1% шанс - 3 совпадения
    const secretCode = generateRandomCode();
    return {
      secretCode,
      userCode: [...secretCode],
      matches: 3
    };
  } else if (random < 16) {
    // 15% шанс - 2 совпадения
    const secretCode = generateRandomCode();
    const userCode = [...secretCode];
    // Меняем одну случайную цифру
    const randomIndex = Math.floor(Math.random() * 3);
    userCode[randomIndex] = (userCode[randomIndex] + Math.floor(Math.random() * 9) + 1) % 10;
    return {
      secretCode,
      userCode,
      matches: 2
    };
  } else {
    // Остальное - 0 или 1 совпадение
    const secretCode = generateRandomCode();
    const userCode = generateRandomCode();
    const matches = countMatches(secretCode, userCode);
    return {
      secretCode,
      userCode,
      matches
    };
  }
}

/**
 * Игра Safe Cracker
 */
const playSafeCracker = async (req, res) => {
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

    // Проверяем наличие попыток
    if (!user.game_attempts || user.game_attempts <= 0) {
      return res.status(403).json({
        success: false,
        message: 'У вас закончились попытки для игры Safe Cracker'
      });
    }

    // Симулируем взлом сейфа
    const { secretCode, userCode, matches } = simulateSafeCracker();

    logger.info(`SafeCracker - пользователь ${user.username}: секретный код ${secretCode}, код пользователя ${userCode}, совпадений: ${matches}`);

    // Определяем приз
    const prize = determinePrize(matches);

    // Уменьшаем количество попыток
    user.game_attempts -= 1;

    // Применяем приз если есть
    let message = '';
    if (prize.days > 0) {
      const currentSubscriptionDays = user.subscription_days_left || 0;
      const newSubscriptionDays = currentSubscriptionDays + prize.days;

      logger.info(`Пользователь ${user.username} выиграл ${prize.days} дней подписки в SafeCracker (${matches} совпадения). Было: ${currentSubscriptionDays}, станет: ${newSubscriptionDays}`);

      user.subscription_days_left = newSubscriptionDays;
      message = `🎉 Поздравляем! ${matches} совпадения! Вы выиграли ${prize.days} ${prize.days === 1 ? 'день' : 'дней'} подписки!`;

      // Создаем транзакцию
      await Transaction.create({
        user_id: userId,
        type: 'bonus',
        amount: 0,
        description: `Выигрыш в Safe Cracker: ${prize.days} ${prize.days === 1 ? 'день' : 'дней'} подписки`
      });
    } else {
      message = matches === 1
        ? 'Одно совпадение! Попробуйте еще раз.'
        : 'Не угадали. Попробуйте еще раз!';
    }

    await user.save();

    // Формируем ответ
    const response = {
      success: true,
      message,
      secret_code: secretCode,
      user_code: userCode,
      matches,
      prize_type: prize.type,
      prize_days: prize.days,
      remaining_attempts: user.game_attempts
    };

    logger.info(`SafeCracker - ответ пользователю ${user.username}:`, response);

    res.json(response);

  } catch (error) {
    logger.error('Ошибка при игре в SafeCracker:', error);
    res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
};

module.exports = playSafeCracker;
