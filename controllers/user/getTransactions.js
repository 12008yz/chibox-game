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

async function getTransactions(req, res) {
  try {
    const userId = req.user.id;
    const transactions = await db.Transaction.findAll({ where: { user_id: userId } });
    logger.info(`История транзакций пользователя ${userId}`);
    return res.json({ transactions });
  } catch (error) {
    logger.error('Ошибка получения истории транзакций:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getTransactions
};
