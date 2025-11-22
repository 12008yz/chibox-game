const db = require('../../models');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

async function getStatistics(req, res) {
  try {
    const userId = req.user.id;

    const totalTransactions = await db.Transaction.count({ where: { user_id: userId } });
    // Исправляем типы транзакций на корректные enum значения
    const totalSpent = await db.Transaction.sum('amount', { where: { user_id: userId, type: 'balance_subtract' } });
    const totalEarned = await db.Transaction.sum('amount', { where: { user_id: userId, type: 'balance_add' } });

    const statistics = {
      totalTransactions: totalTransactions || 0,
      totalSpent: totalSpent || 0,
      totalEarned: totalEarned || 0,
    };

    return res.json({ statistics });
  } catch (error) {
    logger.error('Ошибка получения статистики:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

async function getGlobalStatistics(req, res) {
  try {
    // Получаем общее количество пользователей
    const totalUsers = await db.User.count();

    // Получаем общее количество открытых кейсов
    const totalCasesOpened = await db.Case.count();

    // Получаем количество апгрейдов (из инвентаря с source='upgrade')
    const totalUpgrades = await db.UserInventory.count({
      where: { source: 'upgrade' }
    });

    // Получаем количество сыгранных игр (TicTacToe)
    const totalGamesPlayed = await db.TicTacToeGame.count();

    // Попробуем получить из таблицы Statistics, если там есть данные
    let stats = await db.Statistics.findOne({
      order: [['last_calculated', 'DESC']]
    });

    const globalStats = {
      totalUsers: stats?.total_users || totalUsers,
      totalCasesOpened: stats?.total_cases_opened || totalCasesOpened,
      totalUpgrades: totalUpgrades,
      totalGamesPlayed: totalGamesPlayed,
    };

    return res.json({
      success: true,
      data: globalStats
    });
  } catch (error) {
    logger.error('Ошибка получения глобальной статистики:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

module.exports = {
  getStatistics,
  getGlobalStatistics
};
