const { logger } = require('../utils/logger');

// Получаем функцию для трансляции из bin/www
let broadcastLiveDrop = null;

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
    const liveDropData = {
      id: dropData.id || `drop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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

    // Отправляем через Socket.IO
    broadcastLiveDrop(liveDropData);

    logger.info(`Live Drop транслирован: ${user.username} получил ${item.name} (${item.price}₽)`);
  } catch (error) {
    logger.error('Ошибка трансляции живого падения:', error);
  }
}

module.exports = {
  initLiveDropService,
  broadcastDrop
};
