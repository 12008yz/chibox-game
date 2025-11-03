const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

async function cleanupSessions() {
  try {
    logger.info('Начинаем очистку старых сессий...');

    // Удаляем сессии старше 7 дней
    const result = await sequelize.query(`
      DELETE FROM "Sessions"
      WHERE "expires" < NOW() - INTERVAL '7 days'
    `);

    logger.info(`Удалено ${result[1].rowCount || 0} старых сессий`);

    // Проверяем текущее состояние пула соединений
    const poolStats = sequelize.connectionManager.pool;
    logger.info('Статистика пула соединений:', {
      size: poolStats.size,
      available: poolStats.available,
      using: poolStats.using,
      waiting: poolStats.waiting
    });

    return result;
  } catch (error) {
    logger.error('Ошибка при очистке сессий:', error);
    throw error;
  }
}

// Запускаем если вызвали напрямую
if (require.main === module) {
  cleanupSessions()
    .then(() => {
      logger.info('Очистка завершена успешно');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Ошибка при очистке:', error);
      process.exit(1);
    });
}

module.exports = cleanupSessions;
