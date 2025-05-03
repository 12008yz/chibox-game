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

async function getNotifications(req, res) {
  try {
    const userId = req.user.id;
    const notifications = await db.Notification.findAll({
      where: { user_id: userId },
      attributes: [
        'id', 'user_id', 'title', 'message', 'type', 'category', 'link',
        'is_read', 'read_at', 'expires_at', 'importance', 'data', 'created_at', 'updated_at'
      ]
    });
    return res.json({ notifications });
  } catch (error) {
    logger.error('Ошибка получения уведомлений:', error);
    return res.status(500).json({ message: 'Внутренняя ошибка сервера' });
  }
}

module.exports = {
  getNotifications,
};
