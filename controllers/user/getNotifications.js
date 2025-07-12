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
    const { page = 1, limit = 20, unread_only = false } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = { user_id: userId };

    if (unread_only === 'true') {
      whereClause.is_read = false;
    }

    const { count, rows: notifications } = await db.Notification.findAndCountAll({
      where: whereClause,
      attributes: [
        'id', 'user_id', 'title', 'message', 'type', 'category', 'link',
        'is_read', 'read_at', 'expires_at', 'importance', 'data', 'created_at', 'updated_at'
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const totalPages = Math.ceil(count / limit);

    return res.json({
      success: true,
      data: {
        items: notifications,
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: totalPages
      }
    });
  } catch (error) {
    logger.error('Ошибка получения уведомлений:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

async function getUnreadCount(req, res) {
  try {
    const userId = req.user.id;

    const count = await db.Notification.count({
      where: {
        user_id: userId,
        is_read: false
      }
    });

    return res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    logger.error('Ошибка получения количества непрочитанных уведомлений:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

async function markAsRead(req, res) {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const notification = await db.Notification.findOne({
      where: {
        id: notificationId,
        user_id: userId
      }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Уведомление не найдено'
      });
    }

    await notification.update({
      is_read: true,
      read_at: new Date()
    });

    return res.json({
      success: true,
      data: null,
      message: 'Уведомление отмечено как прочитанное'
    });
  } catch (error) {
    logger.error('Ошибка отметки уведомления как прочитанного:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

async function markAllAsRead(req, res) {
  try {
    const userId = req.user.id;

    await db.Notification.update(
      {
        is_read: true,
        read_at: new Date()
      },
      {
        where: {
          user_id: userId,
          is_read: false
        }
      }
    );

    return res.json({
      success: true,
      data: null,
      message: 'Все уведомления отмечены как прочитанные'
    });
  } catch (error) {
    logger.error('Ошибка отметки всех уведомлений как прочитанных:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

async function deleteNotification(req, res) {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const notification = await db.Notification.findOne({
      where: {
        id: notificationId,
        user_id: userId
      }
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Уведомление не найдено'
      });
    }

    await notification.destroy();

    return res.json({
      success: true,
      data: null,
      message: 'Уведомление удалено'
    });
  } catch (error) {
    logger.error('Ошибка удаления уведомления:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification
};
