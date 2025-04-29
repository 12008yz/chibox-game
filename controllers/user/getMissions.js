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

async function getMissions(req, res) {
  try {
    const userId = req.user.id;
    const missions = await db.UserMission.findAll({ where: { user_id: userId }, include: db.Mission });
    return res.json({ missions });
  } catch (error) {
    logger.error('Ошибка получения миссий:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getMissions
};
