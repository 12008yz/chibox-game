const { getTradeUrlFromSteam, getTradePrivacyUrl, isValidTradeUrl } = require('../../utils/steamTradeHelper');
const { logger } = require('../../utils/logger');
const db = require('../../models');

/**
 * Контроллер для получения Trade URL из Steam профиля пользователя
 */
async function fetchSteamTradeUrl(req, res) {
  try {
    const userId = req.user.id;

    // Получаем данные пользователя
    const user = await db.User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Проверяем, что у пользователя есть Steam ID
    if (!user.steam_id) {
      return res.status(400).json({
        success: false,
        message: 'Steam аккаунт не подключен. Сначала подключите Steam аккаунт.',
        action: 'link_steam_first'
      });
    }

    logger.info(`Попытка получения Trade URL для пользователя ${userId} с Steam ID: ${user.steam_id}`);

    // Пытаемся получить Trade URL из Steam
    const tradeUrl = await getTradeUrlFromSteam(user.steam_id);

    if (tradeUrl) {
      // Если Trade URL получен, сохраняем его в базе данных
      await db.User.update(
        { steam_trade_url: tradeUrl },
        { where: { id: userId } }
      );

      logger.info(`Trade URL успешно получен и сохранен для пользователя ${userId}`);

      // Создаем уведомление об успешном получении Trade URL
      await db.Notification.create({
        user_id: userId,
        title: 'Trade URL получен',
        message: 'Steam Trade URL автоматически получен и сохранен в настройках профиля.',
        type: 'success',
        category: 'general',
        importance: 5
      });

      return res.json({
        success: true,
        message: 'Trade URL успешно получен и сохранен',
        data: {
          steam_trade_url: tradeUrl,
          auto_fetched: true
        }
      });
    } else {
      // Если не удалось получить Trade URL автоматически
      const privacyUrl = getTradePrivacyUrl(user.steam_id);

      logger.warn(`Не удалось автоматически получить Trade URL для пользователя ${userId}`);

      return res.json({
        success: false,
        message: 'Не удалось автоматически получить Trade URL',
        data: {
          steam_trade_url: null,
          auto_fetched: false,
          manual_instructions: {
            title: 'Как получить Trade URL вручную:',
            steps: [
              'Откройте Steam в браузере',
              'Перейдите в Инвентарь → Предложения обменов',
              'Нажмите "Кто может отправить мне запросы на обмен?"',
              'Скопируйте URL из поля "Trade URL"',
              'Вставьте его в настройки профиля на нашем сайте'
            ],
            privacy_url: privacyUrl,
            privacy_url_description: 'Прямая ссылка на страницу настроек приватности Steam'
          }
        }
      });
    }

  } catch (error) {
    logger.error(`Ошибка при получении Trade URL для пользователя ${req.user?.id}:`, error);

    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера при получении Trade URL',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Контроллер для проверки текущего статуса Trade URL
 */
async function getTradeUrlStatus(req, res) {
  try {
    const userId = req.user.id;

    const user = await db.User.findByPk(userId, {
      attributes: ['id', 'steam_id', 'steam_trade_url', 'steam_profile_url']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    const hasTradeUrl = !!user.steam_trade_url;
    const hasSteamId = !!user.steam_id;
    const isValidUrl = hasTradeUrl ? isValidTradeUrl(user.steam_trade_url) : false;

    const response = {
      success: true,
      data: {
        has_steam_id: hasSteamId,
        has_trade_url: hasTradeUrl,
        is_valid_trade_url: isValidUrl,
        steam_trade_url: hasTradeUrl ? user.steam_trade_url : null,
        can_auto_fetch: hasSteamId && !hasTradeUrl
      }
    };

    if (hasSteamId) {
      response.data.privacy_url = getTradePrivacyUrl(user.steam_id);
    }

    return res.json(response);

  } catch (error) {
    logger.error(`Ошибка при проверке статуса Trade URL для пользователя ${req.user?.id}:`, error);

    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера при проверке статуса Trade URL'
    });
  }
}

module.exports = {
  fetchSteamTradeUrl,
  getTradeUrlStatus
};
