const axios = require('axios');
const { logger } = require('./logger');

/**
 * Автоматически получает Trade URL из Steam профиля пользователя
 * @param {string} steamId - Steam ID пользователя
 * @returns {Promise<string|null>} Trade URL или null если не удалось получить
 */
async function getTradeUrlFromSteam(steamId) {
  try {
    // URL страницы приватности Steam для получения Trade URL
    const privacyUrl = `https://steamcommunity.com/profiles/${steamId}/tradeoffers/privacy`;

    logger.info(`Попытка получения Trade URL для Steam ID: ${steamId}`);

    // Делаем запрос к странице приватности Steam
    const response = await axios.get(privacyUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    // Ищем Trade URL в HTML странице
    const html = response.data;

    // Регулярное выражение для поиска Trade URL
    const tradeUrlMatch = html.match(/https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[a-zA-Z0-9_-]+/);

    if (tradeUrlMatch) {
      const tradeUrl = tradeUrlMatch[0];
      logger.info(`Trade URL успешно получен для Steam ID ${steamId}: ${tradeUrl}`);
      return tradeUrl;
    }

    // Альтернативный поиск в случае, если URL экранирован
    const encodedMatch = html.match(/https:\/\/steamcommunity\.com\/tradeoffer\/new\/\\?partner=\d+\\&amp;token=[a-zA-Z0-9_-]+/);
    if (encodedMatch) {
      const tradeUrl = encodedMatch[0]
        .replace(/\\/g, '')
        .replace(/&amp;/g, '&');
      logger.info(`Trade URL успешно получен (экранированный) для Steam ID ${steamId}: ${tradeUrl}`);
      return tradeUrl;
    }

    logger.warn(`Trade URL не найден на странице приватности для Steam ID: ${steamId}`);
    return null;

  } catch (error) {
    if (error.response) {
      // Профиль может быть приватным или недоступным
      if (error.response.status === 403) {
        logger.warn(`Профиль Steam недоступен (приватный) для Steam ID: ${steamId}`);
      } else if (error.response.status === 404) {
        logger.warn(`Профиль Steam не найден для Steam ID: ${steamId}`);
      } else {
        logger.error(`Ошибка HTTP при получении Trade URL для Steam ID ${steamId}:`, error.response.status);
      }
    } else if (error.code === 'ECONNABORTED') {
      logger.error(`Таймаут при получении Trade URL для Steam ID ${steamId}`);
    } else {
      logger.error(`Ошибка при получении Trade URL для Steam ID ${steamId}:`, error.message);
    }
    return null;
  }
}

/**
 * Генерирует URL страницы приватности Steam
 * @param {string} steamId - Steam ID пользователя
 * @returns {string} URL страницы приватности
 */
function getTradePrivacyUrl(steamId) {
  return `https://steamcommunity.com/profiles/${steamId}/tradeoffers/privacy`;
}

/**
 * Проверяет валидность Trade URL
 * @param {string} tradeUrl - Trade URL для проверки
 * @returns {boolean} true если URL валидный
 */
function isValidTradeUrl(tradeUrl) {
  if (!tradeUrl || typeof tradeUrl !== 'string') {
    return false;
  }

  // Проверяем формат Trade URL
  const tradeUrlPattern = /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[a-zA-Z0-9_-]+$/;
  return tradeUrlPattern.test(tradeUrl);
}

/**
 * Извлекает partner ID из Trade URL
 * @param {string} tradeUrl - Trade URL
 * @returns {string|null} Partner ID или null
 */
function extractPartnerFromTradeUrl(tradeUrl) {
  try {
    const match = tradeUrl.match(/partner=(\d+)/);
    return match ? match[1] : null;
  } catch (error) {
    logger.error('Ошибка при извлечении partner ID из Trade URL:', error);
    return null;
  }
}

/**
 * Проверяет, соответствует ли Trade URL указанному Steam ID
 * @param {string} tradeUrl - Trade URL для проверки
 * @param {string} steamId - Steam ID пользователя
 * @returns {boolean} true если Trade URL принадлежит пользователю
 */
function isTradeUrlForSteamId(tradeUrl, steamId) {
  try {
    if (!isValidTradeUrl(tradeUrl) || !steamId) {
      return false;
    }

    const partnerId = extractPartnerFromTradeUrl(tradeUrl);
    if (!partnerId) {
      return false;
    }

    // Конвертируем Steam ID в Partner ID
    // Steam ID = Partner ID + 76561197960265728
    const steamIdBigInt = BigInt(steamId);
    const expectedPartnerId = (steamIdBigInt - BigInt('76561197960265728')).toString();

    return partnerId === expectedPartnerId;
  } catch (error) {
    logger.error('Ошибка при проверке соответствия Trade URL и Steam ID:', error);
    return false;
  }
}

module.exports = {
  getTradeUrlFromSteam,
  getTradePrivacyUrl,
  isValidTradeUrl,
  extractPartnerFromTradeUrl,
  isTradeUrlForSteamId
};
