const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

// Счетчики для предупреждений
let warningCount = 0;
const WARNING_THRESHOLD = 10; // Порог предупреждений

function monitorPool(req, res, next) {
  try {
    const pool = sequelize.connectionManager.pool;

    if (!pool) {
      return next();
    }

    const stats = {
      size: pool.size || 0,
      available: pool.available || 0,
      using: pool.using || 0,
      waiting: pool.waiting || 0
    };

    // Проверяем критическое состояние пула
    const usagePercent = stats.size > 0 ? (stats.using / stats.size) * 100 : 0;

    if (usagePercent > 90) {
      warningCount++;

      if (warningCount % WARNING_THRESHOLD === 0) {
        logger.warn('КРИТИЧЕСКОЕ СОСТОЯНИЕ ПУЛА СОЕДИНЕНИЙ:', {
          ...stats,
          usagePercent: `${usagePercent.toFixed(2)}%`,
          endpoint: `${req.method} ${req.path}`,
          warningCount
        });
      }
    } else {
      // Сбрасываем счетчик если все нормально
      if (warningCount > 0) {
        warningCount = 0;
      }
    }

    // Добавляем информацию в заголовки ответа (для отладки)
    res.setHeader('X-DB-Pool-Size', stats.size);
    res.setHeader('X-DB-Pool-Using', stats.using);
    res.setHeader('X-DB-Pool-Available', stats.available);

    next();
  } catch (error) {
    logger.error('Ошибка в мониторинге пула:', error);
    next();
  }
}

// Функция для получения текущей статистики
function getPoolStats() {
  try {
    const pool = sequelize.connectionManager.pool;

    if (!pool) {
      return null;
    }

    return {
      size: pool.size || 0,
      available: pool.available || 0,
      using: pool.using || 0,
      waiting: pool.waiting || 0,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Ошибка при получении статистики пула:', error);
    return null;
  }
}

module.exports = { monitorPool, getPoolStats };
