const { logger } = require('../utils/logger');

// Получаем функцию для трансляции из bin/www
let broadcastLiveDrop = null;

// Кеш для отслеживания отправленных падений
const sentDrops = new Set();

// Инициализация сервиса с функцией трансляции
function initLiveDropService(broadcastFn) {
  broadcastLiveDrop = broadcastFn;
  logger.info('LiveDrop сервис инициализирован');
}

// Функция для трансляции живого падения
function broadcastDrop(user, item, caseData, dropData = {}) {
  if (!broadcastLiveDrop) {
    logger.warn('LiveDrop сервис не инициализирован');
    return;
  }

  try {
    const dropId = dropData.id || `${Date.now()}_${user.id}_${item.id}_${Math.random().toString(36).substr(2, 6)}`;

    // Проверяем, не транслировали ли мы уже это падение
    const dropKey = `${user.id}_${item.id}_${caseData?.id || 'no_case'}`;
    if (sentDrops.has(dropKey)) {
      logger.warn(`Live Drop уже был транслирован: ${dropKey}`);
      return;
    }

    const liveDropData = {
      id: dropId,
      user: {
        id: user.id,
        username: user.username || 'Анонимный игрок',
        level: user.level || 1,
        avatar: user.steam_avatar_url || null
      },
      item: {
        id: item.id,
        name: item.name,
        image: item.image_url,
        price: parseFloat(item.price || 0),
        rarity: item.rarity || 'common'
      },
      case: caseData ? {
        id: caseData.id,
        name: caseData.name
      } : null,
      dropTime: new Date().toISOString(),
      isRare: dropData.isRare || false,
      isHighlighted: dropData.isHighlighted || false,
      price: parseFloat(item.price || 0)
    };

    // Добавляем в кеш отправленных падений
    sentDrops.add(dropKey);

    // Удаляем из кеша через 5 минут для предотвращения утечки памяти
    setTimeout(() => {
      sentDrops.delete(dropKey);
    }, 5 * 60 * 1000);

    // Отправляем через Socket.IO
    broadcastLiveDrop(liveDropData);

    logger.info(`Live Drop транслирован: ${user.username} получил ${item.name} (${item.price}₽) [ID: ${dropId}]`);
  } catch (error) {
    logger.error('Ошибка трансляции живого падения:', error);
  }
}

module.exports = {
  initLiveDropService,
  broadcastDrop
};
