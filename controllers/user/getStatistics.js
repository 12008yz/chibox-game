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

module.exports = {
  getStatistics
};
