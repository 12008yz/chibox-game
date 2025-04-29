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

async function getBalance(req, res) {
  try {
    const userId = req.user.id;
    const user = await db.User.findByPk(userId);
    logger.info(`Баланс пользователя ${userId}: ${user ? user.balance : 'unknown'}`);
    return res.json({ balance: user ? user.balance : 0 });
  } catch (error) {
    logger.error('Ошибка получения баланса:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getBalance
};
