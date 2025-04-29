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

async function getAchievements(req, res) {
  try {
    const userId = req.user.id;
    const achievements = await db.UserAchievement.findAll({ where: { user_id: userId }, include: db.Achievement });
    return res.json({ achievements });
  } catch (error) {
    logger.error('Ошибка получения достижений:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getAchievements
};
