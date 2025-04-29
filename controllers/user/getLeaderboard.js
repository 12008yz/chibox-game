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

async function getLeaderboard(req, res) {
  try {
    const leaderboard = await db.Leaderboard.findAll({
      limit: 50,
      order: [['score', 'DESC']],
      include: [{ model: db.User, as: 'user', attributes: ['id', 'username'] }]
    });
    return res.json({ leaderboard });
  } catch (error) {
    logger.error('Ошибка получения лидерборда:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getLeaderboard
};
