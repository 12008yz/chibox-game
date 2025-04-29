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

async function getBonusStatus(req, res) {
  try {
    const userId = req.user.id;
    const user = await db.User.findByPk(userId);
    return res.json({
      next_bonus_available_time: user.next_bonus_available_time,
      lifetime_bonuses_claimed: user.lifetime_bonuses_claimed,
      last_bonus_date: user.last_bonus_date,
    });
  } catch (error) {
    logger.error('Ошибка проверки статуса бонуса:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getBonusStatus
};
