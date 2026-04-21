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
const isTransactionsDebugEnabled = process.env.DEBUG_TRANSACTIONS === 'true';
function debugLog(...args) {
  if (isTransactionsDebugEnabled) {
    logger.info(...args);
  }
}

async function getTransactions(req, res) {
  try {
    const userId = req.user.id;
    const requestedLimit = parseInt(req.query.limit, 10);
    const requestedOffset = parseInt(req.query.offset, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

    const transactions = await db.Transaction.findAll({
      where: { user_id: userId },
      limit,
      offset,
      order: [['created_at', 'DESC']]
    });
    debugLog(`История транзакций пользователя ${userId}`);
    return res.json({
      transactions,
      pagination: {
        limit,
        offset
      }
    });
  } catch (error) {
    logger.error('Ошибка получения истории транзакций:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getTransactions
};
