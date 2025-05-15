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
    let leaderboard = await db.LeaderboardEntry.findAll({
      limit: 50,
      order: [['score', 'DESC']],
      include: [{ model: db.User, as: 'user', attributes: ['id', 'username'] }]
    });

    if (leaderboard.length === 0) {
      // Если таблица пустая, добавляем первых 10 пользователей с нулевым счетом
      const users = await db.User.findAll({
        limit: 10,
        order: [['createdAt', 'ASC']],
        attributes: ['id', 'username']
      });

      // Получаем активный leaderboard для связи
      let activeLeaderboard = await db.Leaderboard.findOne({
        where: { is_active: true, period: 'alltime' }
      });

      if (!activeLeaderboard) {
        // Если активная таблица лидеров не найдена, создаём её
        const newLeaderboard = await db.Leaderboard.create({
          type: 'level',
          period: 'alltime',
          title: 'Общий рейтинг',
          description: 'Общий рейтинг пользователей',
          is_active: true,
          display_limit: 100
        });

        activeLeaderboard = newLeaderboard;
      }

      const entries = users.map((user, index) => ({
        leaderboard_id: activeLeaderboard.id,
        user_id: user.id,
        score: 0,
        rank: index + 1,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      await db.LeaderboardEntry.bulkCreate(entries);

      leaderboard = await db.LeaderboardEntry.findAll({
        limit: 50,
        order: [['score', 'DESC']],
        include: [{ model: db.User, as: 'user', attributes: ['id', 'username'] }]
      });
    }

    return res.json({ leaderboard });
  } catch (error) {
    logger.error('Ошибка получения лидерборда:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getLeaderboard
};
