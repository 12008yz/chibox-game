const { logger } = require('../utils/logger');
const isLiveDropDebugEnabled = process.env.DEBUG_LIVE_DROPS === 'true';

function debugLog(...args) {
  if (isLiveDropDebugEnabled) {
    logger.info(...args);
  }
}

// Получаем функцию для трансляции из bin/www
let broadcastLiveDrop = null;

// Кеш для отслеживания отправленных падений
const sentDrops = new Set();

// Инициализация сервиса с функцией трансляции
function initLiveDropService(broadcastFn) {
  broadcastLiveDrop = broadcastFn;
  debugLog('LiveDrop сервис инициализирован');
}

// Функция для трансляции живого падения
function broadcastDrop(user, item, caseData, dropData = {}) {
  if (!broadcastLiveDrop) {
    logger.warn('LiveDrop сервис не инициализирован');
    return;
  }

  try {
    // Проверяем, что есть ID дропа - если нет, значит есть проблема
    if (!dropData.id) {
      logger.error('LiveDrop: Отсутствует ID дропа, пропускаем трансляцию');
      return;
    }

    const dropId = dropData.id;

    // Используем dropId как уникальный ключ для предотвращения дублирования
    const dropKey = `drop_${dropId}`;
    if (sentDrops.has(dropKey)) {
      logger.warn(`Live Drop уже был транслирован: ${dropKey}`);
      return;
    }

    const baseUrl = process.env.BASE_URL || 'https://chibox-game.ru';
    const avatarUrl = (url) => {
      if (!url) return null;
      if (url.startsWith('/')) return baseUrl + url;
      return url;
    };

    const liveDropData = {
      id: dropId,
      user: {
        id: user.id,
        username: user.username || 'Анонимный игрок',
        level: user.level || 1,
        avatar: user.avatar_url
          ? baseUrl + user.avatar_url
          : avatarUrl(user.steam_avatar_url),
        steam_avatar_url: avatarUrl(user.steam_avatar_url)
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

    debugLog(`Live Drop транслирован: ${user.username} получил ${item.name} (${item.price}₽) [ID: ${dropId}]`);
  } catch (error) {
    logger.error('Ошибка трансляции живого падения:', error);
  }
}

module.exports = {
  initLiveDropService,
  broadcastDrop
};
