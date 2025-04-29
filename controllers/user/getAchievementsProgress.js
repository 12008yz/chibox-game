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

async function getAchievementsProgress(req, res) {
  try {
    const userId = req.user.id;
    const achs = await db.UserAchievement.findAll({
      where: { userId },
      include: [{ model: db.Achievement }]
    });
    const progress = achs.map(entry => ({
      id: entry.achievement_id,
      name: entry.Achievement ? entry.Achievement.name : '',
      description: entry.Achievement ? entry.Achievement.description : '',
      completed: entry.completed,
      progress: entry.progress
    }));
    return res.json({ progress });
  } catch (error) {
    logger.error('Ошибка получения прогресса достижений:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getAchievementsProgress
};
