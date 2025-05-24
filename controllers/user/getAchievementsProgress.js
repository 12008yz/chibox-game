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

    // Получаем все достижения с прогрессом пользователя (если есть)
    const achievements = await db.Achievement.findAll({
      where: { is_active: true },
      include: [{
        model: db.UserAchievement,
        as: 'user_achievements',
        where: { user_id: userId },
        required: false // LEFT JOIN, чтобы получить все достижения
      }],
      order: [['display_order', 'ASC']]
    });

    let progress = achievements.map(ach => {
      const userAch = ach.user_achievements && ach.user_achievements.length > 0 ? ach.user_achievements[0] : null;
      return {
        id: ach.id,
        name: ach.name,
        description: ach.description,
        completed: userAch ? userAch.is_completed : false,
        progress: userAch ? userAch.current_progress : 0
      };
    });

    // Сортируем: выполненные вверху, а с прогрессом 0 внизу
    progress = progress.sort((a, b) => {
      if (a.completed && !b.completed) return -1;
      if (!a.completed && b.completed) return 1;
      if (a.progress === 0 && b.progress !== 0) return 1;
      if (a.progress !== 0 && b.progress === 0) return -1;
      return 0;
    });

    return res.json({ progress });
  } catch (error) {
    logger.error('Ошибка получения прогресса достижений:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getAchievementsProgress
};
