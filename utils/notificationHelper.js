const db = require('../models');
const { logger } = require('./logger');

// Функция для отправки уведомления через WebSocket
let sendNotificationToUser = null;

// Инициализация функции отправки уведомлений
function initNotificationSender(senderFunction) {
  sendNotificationToUser = senderFunction;
  logger.info('Функция отправки уведомлений через WebSocket инициализирована');
}

/**
 * Создание уведомления для пользователя
 * @param {string} userId - ID пользователя
 * @param {string} title - Заголовок уведомления
 * @param {string} message - Текст уведомления
 * @param {string} type - Тип уведомления (info, success, warning, error, system)
 * @param {string} category - Категория уведомления
 * @param {Object} options - Дополнительные опции
 * @returns {Promise<Object>} Созданное уведомление
 */
async function createNotification(userId, title, message, type = 'info', category = 'general', options = {}) {
  try {
    const notificationData = {
      user_id: userId,
      title: title,
      message: message,
      type: type,
      category: category,
      link: options.link || null,
      importance: options.importance || 0,
      data: options.data || null,
      expires_at: options.expiresAt || null
    };

    const notification = await db.Notification.create(notificationData);

    logger.info('Уведомление создано:', {
      notificationId: notification.id,
      userId: userId,
      title: title,
      type: type,
      category: category
    });

    // Отправляем уведомление через WebSocket в реальном времени
    if (sendNotificationToUser && typeof sendNotificationToUser === 'function') {
      try {
        sendNotificationToUser(userId, {
          id: notification.id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          category: notification.category,
          link: notification.link,
          importance: notification.importance,
          is_read: notification.is_read,
          created_at: notification.created_at
        });
      } catch (wsError) {
        logger.warn('Ошибка отправки уведомления через WebSocket (пользователь может быть оффлайн):', {
          userId: userId,
          error: wsError.message
        });
      }
    }

    return notification;
  } catch (error) {
    logger.error('Ошибка создания уведомления:', {
      userId: userId,
      title: title,
      error: error.message
    });
    throw error;
  }
}

/**
 * Создание уведомления о входе через Steam
 * @param {string} userId - ID пользователя
 * @param {string} username - Имя пользователя
 * @returns {Promise<Object>} Созданное уведомление
 */
async function createSteamLoginNotification(userId, username) {
  return await createNotification(
    userId,
    'Вход через Steam',
    'Вы вошли с помощью Steam! \nДобро пожаловать!',
    'success',
    'general',
    {
      importance: 1,
      data: {
        login_method: 'steam',
        username: username
      }
    }
  );
}

/**
 * Создание уведомления о регистрации
 * @param {string} userId - ID пользователя
 * @param {string} username - Имя пользователя
 * @returns {Promise<Object>} Созданное уведомление
 */
async function createRegistrationNotification(userId, username) {
  return await createNotification(
    userId,
    'Добро пожаловать в Chibox!',
    'Вы успешно зарегистрировались в Chibox! Не забудьте подтвердить почту в профиле!',
    'success',
    'general',
    {
      importance: 2,
      data: {
        registration_method: 'email',
        username: username
      }
    }
  );
}

module.exports = {
  createNotification,
  createSteamLoginNotification,
  createRegistrationNotification,
  initNotificationSender
};
