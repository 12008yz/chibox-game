const { User } = require('../models');
const { logger } = require('../utils/logger');

/**
 * Скрипт для обновления всех пользователей с дефолтным значением game_attempts
 */
async function updateGameAttempts() {
  try {
    logger.info('Начинаем обновление game_attempts для всех пользователей...');

    // Обновляем всех пользователей, у которых game_attempts null или undefined
    const result = await User.update(
      { game_attempts: 3 },
      {
        where: {
          game_attempts: null
        }
      }
    );

    logger.info(`Обновлено пользователей: ${result[0]}`);

    // Также установим значение 3 для всех, у кого 0
    const result2 = await User.update(
      { game_attempts: 3 },
      {
        where: {
          game_attempts: 0
        }
      }
    );

    logger.info(`Дополнительно обновлено пользователей с 0 попытками: ${result2[0]}`);

    logger.info('Обновление завершено успешно!');
    process.exit(0);
  } catch (error) {
    logger.error('Ошибка при обновлении game_attempts:', error);
    process.exit(1);
  }
}

updateGameAttempts();
