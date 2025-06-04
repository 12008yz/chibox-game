const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');
const SteamTotp = require('steam-totp');
const winston = require('winston');

// Добавляем логгер
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'steam-bot.log' })
  ],
});

let instance = null;
let hasLoggedIn = false;

class SteamBot {
  constructor(accountName, password, sharedSecret, identitySecret, steamApiKey = null) {
    if (instance) {
      return instance;
    }
    this.client = new SteamUser();
    this.community = new SteamCommunity();
    this.manager = new TradeOfferManager({
      steam: this.client,
      community: this.community,
      language: 'en',
    });
    this.accountName = accountName;
    this.password = password;
    this.sharedSecret = sharedSecret;
    this.identitySecret = identitySecret;
    this.steamApiKey = steamApiKey;
    this.loggedIn = false;

    // Регистрируем обработчик событий для трейдов
    this.setupTradeOfferEvents();

    instance = this;
  }

  // Настройка обработчиков событий для трейдов
  setupTradeOfferEvents() {
    // Событие при получении нового трейда
    this.manager.on('newOffer', (offer) => {
      logger.info(`Получено новое торговое предложение #${offer.id} от ${offer.partner.getSteamID64()}`);

      // Автоматическое принятие входящих трейдов от определенных пользователей можно настроить
      // Пока просто логируем
    });

    // Событие при изменении статуса трейда
    this.manager.on('sentOfferChanged', (offer, oldState) => {
      logger.info(`Изменение статуса трейда #${offer.id}: ${oldState} -> ${offer.state}`);
    });

    // Событие успешного обмена
    this.manager.on('sentOfferAccepted', async (offer) => {
      logger.info(`Трейд #${offer.id} принят!`);

      try {
        const itemDetails = offer.itemsToGive.map(item => ({
          assetid: item.assetid,
          market_hash_name: item.market_hash_name,
          app_id: item.appid,
          context_id: item.contextid
        }));

        logger.info(`Отправлены предметы: ${JSON.stringify(itemDetails)}`);
      } catch (error) {
        logger.error(`Ошибка при обработке принятого трейда #${offer.id}:`, error);
      }
    });

    // Событие отклонения трейда
    this.manager.on('sentOfferDeclined', (offer) => {
      logger.warn(`Трейд #${offer.id} отклонен пользователем!`);
    });
  }

  async login() {
    if (hasLoggedIn) {
      logger.info('Already logged in, skipping login.');
      return;
    }
    return new Promise((resolve, reject) => {
      // Генерируем код 2FA для первого логина
      const twoFactorCode = SteamTotp.generateAuthCode(this.sharedSecret);
      const logOnOptions = {
        accountName: this.accountName,
        password: this.password,
        twoFactorCode: twoFactorCode
      };
      logger.info('Attempting Steam login...');
      this.client.logOn(logOnOptions);

      this.client.once('loggedOn', () => {
        this.loggedIn = true;
        hasLoggedIn = true;
        logger.info('Logged into Steam as ' + this.client.steamID.getSteam3RenderedID());
        // Ждать webSession!
      });

      this.client.once('webSession', (sessionID, cookies) => {
        logger.info('Steam webSession received, setting cookies to manager & community...');
        this.manager.setCookies(cookies);
        this.community.setCookies(cookies);
        this.community.startConfirmationChecker(10000, this.identitySecret);

        // Устанавливаем API ключ если он есть
        if (this.steamApiKey) {
          this.manager.apiKey = this.steamApiKey;
          logger.info('Steam API key set for Trade Manager');
        } else {
          logger.warn('Steam API key not provided - trade functionality may be limited');
        }

        // Сохраняем session данные для Steam Market
        this.sessionId = sessionID;
        this.cookies = cookies;

        // Извлекаем steamLoginSecure из cookies
        const steamLoginSecureCookie = cookies.find(cookie => cookie.startsWith('steamLoginSecure='));
        if (steamLoginSecureCookie) {
          this.steamLoginSecure = steamLoginSecureCookie.replace('steamLoginSecure=', '').split(';')[0];
          logger.info('Steam session data extracted successfully');
        }

        logger.info('Cookies set, confirmation checker started, bot now fully operational.');
        resolve();
      });

      this.client.once('error', (err) => {
        logger.error('Steam login error:', err);
        reject(err);
      });

      // Steam Guard обработка - всегда отправлять актуальный мобильный код из sharedSecret
      this.client.on('steamGuard', (domain, callback) => {
        if (!domain) {
          const code = SteamTotp.generateAuthCode(this.sharedSecret);
          logger.info('Generated Steam Guard (2FA Mobile) code:', code);
          callback(code);
        } else {
          logger.error('Steam Guard requires code from email:', domain);
          callback(null); // Если вдруг нужен код с почты — ручное вмешательство
        }
      });
    });
  }

  // Получение информации о предмете
  async getItemDetails(appId, assetId, contextId = 2) {
    return new Promise((resolve, reject) => {
      this.community.getAssetDetails(appId, assetId, contextId, true, (err, details) => {
        if (err) {
          logger.error(`Ошибка получения деталей предмета: ${err}`);
          return reject(err);
        }
        logger.info(`Получены детали предмета ${assetId}: ${details.market_hash_name}`);
        resolve(details);
      });
    });
  }

  // Получение полного инвентаря бота для определенной игры
  async getInventory(appId = 730, contextId = 2, tradableOnly = true) {
    return new Promise((resolve, reject) => {
      logger.info(`Загрузка инвентаря для игры ${appId}...`);
      this.manager.getInventoryContents(appId, contextId, tradableOnly, (err, items) => {
        if (err) {
          logger.error(`Ошибка при загрузке инвентаря: ${err}`);
          return reject(err);
        }
        logger.info(`Инвентарь загружен (${items.length} предметов)`);
        resolve(items);
      });
    });
  }

  // Поиск предмета в инвентаре по market_hash_name и состоянию
  async findItemInInventory(marketHashName, exterior = null, appId = 730, contextId = 2) {
    try {
      const inventory = await this.getInventory(appId, contextId, true);

      // Если указано состояние (exterior), ищем с учетом его
      if (exterior) {
        // Подготавливаем имя для поиска
        let fullName = marketHashName;
        if (!fullName.includes(exterior)) {
          fullName = `${marketHashName} (${exterior})`;
        }

        logger.info(`Поиск предмета ${fullName} в инвентаре...`);
        const item = inventory.find(item => item.market_hash_name === fullName);

        if (item) {
          logger.info(`Найден предмет ${fullName} с assetid ${item.assetid}`);
          return item;
        }
      } else {
        // Ищем без учета состояния (просто по названию)
        logger.info(`Поиск предмета ${marketHashName} в инвентаре...`);
        const item = inventory.find(item => item.market_hash_name.includes(marketHashName));

        if (item) {
          logger.info(`Найден предмет ${item.market_hash_name} с assetid ${item.assetid}`);
          return item;
        }
      }

      logger.warn(`Предмет ${marketHashName} ${exterior ? `(${exterior})` : ''} не найден в инвентаре`);
      return null;
    } catch (error) {
      logger.error(`Ошибка при поиске предмета в инвентаре: ${error}`);
      throw error;
    }
  }

  async buyItem(marketHashName, price) {
    throw new Error('Buying items programmatically is not supported directly by SteamUser library.');
  }

  // Отправка торгового предложения
  async sendTradeOffer(partnerSteamId, itemsToGive, itemsToReceive = []) {
    return new Promise((resolve, reject) => {
      const offer = this.manager.createOffer(partnerSteamId);
      if (itemsToGive.length > 0) {
        offer.addMyItems(itemsToGive);
      }
      if (itemsToReceive.length > 0) {
        offer.addTheirItems(itemsToReceive);
      }

      logger.info(`Создание торгового предложения для ${partnerSteamId}. Отправка ${itemsToGive.length} предметов, получение ${itemsToReceive.length} предметов.`);

      offer.send(async (err, status) => {
        if (err) {
          logger.error('Failed to send trade offer:', err);
          return resolve({
            success: false,
            message: err.message,
            error: err
          });
        }
        logger.info(`Trade offer sent. Status: ${status}, Offer ID: ${offer.id}`);
        try {
          await this.community.acceptConfirmationForObject(this.identitySecret, offer.id);
          logger.info(`Trade offer confirmed: ${offer.id}`);
          resolve({
            success: true,
            tradeOfferId: offer.id,
            status,
            offer
          });
        } catch (confirmErr) {
          logger.error('Failed to confirm trade offer:', confirmErr);
          resolve({
            success: false,
            message: confirmErr.message,
            error: confirmErr
          });
        }
      });
    });
  }

  // Метод для отправки трейда с Trade URL (удобная обертка)
  async sendTrade(tradeUrl, assetIds) {
    try {
      // Извлекаем partner ID из Trade URL
      const partnerMatch = tradeUrl.match(/partner=(\d+)/);
      if (!partnerMatch) {
        return {
          success: false,
          message: 'Неверный формат Trade URL - не найден partner ID'
        };
      }

      // Преобразуем partner ID в SteamID64
      const partnerId = partnerMatch[1];
      const partnerSteamId = (BigInt(partnerId) + BigInt('76561197960265728')).toString();

      logger.info(`Извлечен partner ID: ${partnerId}, SteamID64: ${partnerSteamId}`);

      // Получаем предметы из инвентаря по assetIds
      const inventory = await this.getInventory();
      const itemsToGive = [];

      for (const assetId of assetIds) {
        const item = inventory.find(i => i.assetid === assetId.toString());
        if (item) {
          itemsToGive.push(item);
          logger.info(`Добавлен предмет для трейда: ${item.market_hash_name} (${item.assetid})`);
        } else {
          logger.error(`Предмет с assetid ${assetId} не найден в инвентаре`);
          return {
            success: false,
            message: `Предмет с assetid ${assetId} не найден в инвентаре`
          };
        }
      }

      if (itemsToGive.length === 0) {
        return {
          success: false,
          message: 'Не найдено предметов для отправки'
        };
      }

      // Отправляем трейд
      return await this.sendTradeOffer(partnerSteamId, itemsToGive, []);

    } catch (error) {
      logger.error('Ошибка при отправке трейда:', error);
      return {
        success: false,
        message: error.message,
        error
      };
    }
  }

  // Принятие торгового предложения
  async acceptTradeOffer(offerId) {
    return new Promise((resolve, reject) => {
      logger.info(`Принятие торгового предложения #${offerId}...`);
      this.manager.getOffer(offerId, (err, offer) => {
        if (err) {
          logger.error(`Ошибка при получении трейда #${offerId}: ${err}`);
          return reject(err);
        }

        offer.accept(async (acceptErr) => {
          if (acceptErr) {
            logger.error(`Ошибка при принятии трейда #${offerId}: ${acceptErr}`);
            return reject(acceptErr);
          }

          logger.info(`Трейд #${offerId} принят, ожидание подтверждения...`);

          try {
            await this.community.acceptConfirmationForObject(this.identitySecret, offerId);
            logger.info(`Трейд #${offerId} подтвержден!`);
            resolve(true);
          } catch (confirmErr) {
            logger.error(`Ошибка при подтверждении трейда #${offerId}: ${confirmErr}`);
            return reject(confirmErr);
          }
        });
      });
    });
  }

  // Получение статуса трейда
  async getTradeOfferStatus(offerId) {
    return new Promise((resolve, reject) => {
      logger.info(`Проверка статуса трейда #${offerId}...`);
      this.manager.getOffer(offerId, (err, offer) => {
        if (err) {
          logger.error(`Ошибка при получении трейда #${offerId}: ${err}`);
          return reject(err);
        }

        logger.info(`Статус трейда #${offerId}: ${offer.state}`);
        resolve({
          offerId,
          state: offer.state,
          offer
        });
      });
    });
  }

  // Отмена торгового предложения
  async cancelTradeOffer(offerId) {
    return new Promise((resolve, reject) => {
      logger.info(`Отмена торгового предложения #${offerId}...`);
      this.manager.getOffer(offerId, (err, offer) => {
        if (err) {
          logger.error(`Ошибка при получении трейда #${offerId}: ${err}`);
          return reject(err);
        }

        offer.cancel((cancelErr) => {
          if (cancelErr) {
            logger.error(`Ошибка при отмене трейда #${offerId}: ${cancelErr}`);
            return reject(cancelErr);
          }

          logger.info(`Трейд #${offerId} успешно отменен`);
          resolve(true);
        });
      });
    });
  }

  // Проверка статуса трейда - исправляем отсутствующий метод
  async checkTradeOffer(offerId) {
    return new Promise((resolve, reject) => {
      logger.info(`Проверка статуса трейда #${offerId}...`);
      this.manager.getOffer(offerId, (err, offer) => {
        if (err) {
          logger.error(`Ошибка при получении трейда #${offerId}: ${err}`);
          return reject(err);
        }

        const status = offer.state;
        logger.info(`Статус трейда #${offerId}: ${status}`);
        resolve({
          success: true,
          offerId,
          status,
          offer
        });
      });
    });
  }

  // Метод для принятия входящего trade offer
  async acceptTradeOffer(tradeOfferId) {
    try {
      if (!this.loggedIn) {
        logger.error('Бот не авторизован для принятия trade offer');
        return {
          success: false,
          message: 'Бот не авторизован'
        };
      }

      logger.info(`Принимаем trade offer с ID: ${tradeOfferId}`);

      return new Promise((resolve, reject) => {
        // Получаем trade offer по ID
        this.manager.getOffer(tradeOfferId, (err, offer) => {
          if (err) {
            logger.error(`Ошибка при получении trade offer ${tradeOfferId}:`, err);
            return resolve({
              success: false,
              message: `Ошибка получения trade offer: ${err.message}`
            });
          }

          if (!offer) {
            logger.error(`Trade offer ${tradeOfferId} не найден`);
            return resolve({
              success: false,
              message: 'Trade offer не найден'
            });
          }

          // Проверяем состояние trade offer
          if (offer.state !== 2) { // TradeOfferState.Active = 2
            logger.warn(`Trade offer ${tradeOfferId} не активен. Состояние: ${offer.state}`);
            return resolve({
              success: false,
              message: `Trade offer не активен. Состояние: ${offer.state}`
            });
          }

          // Принимаем trade offer
          offer.accept((err, status) => {
            if (err) {
              logger.error(`Ошибка при принятии trade offer ${tradeOfferId}:`, err);
              return resolve({
                success: false,
                message: `Ошибка принятия trade offer: ${err.message}`
              });
            }

            logger.info(`Trade offer ${tradeOfferId} успешно принят. Статус: ${status}`);

            // Подтверждаем trade offer через мобильное приложение
            if (status === 'pending') {
              logger.info(`Trade offer ${tradeOfferId} требует подтверждения через мобильное приложение`);

              // Ищем подтверждение
              this.community.getConfirmations((err, confirmations) => {
                if (err) {
                  logger.error(`Ошибка при получении подтверждений для trade offer ${tradeOfferId}:`, err);
                  return resolve({
                    success: true,
                    message: 'Trade offer принят, но требует ручного подтверждения',
                    status: 'pending_confirmation'
                  });
                }

                // Ищем подтверждение для данного trade offer
                const confirmation = confirmations.find(conf =>
                  conf.type === 2 && conf.creator === tradeOfferId
                );

                if (confirmation) {
                  // Подтверждаем
                  this.community.respondToConfirmation(confirmation.id, confirmation.key, true, (err) => {
                    if (err) {
                      logger.error(`Ошибка при подтверждении trade offer ${tradeOfferId}:`, err);
                      return resolve({
                        success: true,
                        message: 'Trade offer принят, но автоподтверждение не удалось',
                        status: 'pending_confirmation'
                      });
                    }

                    logger.info(`Trade offer ${tradeOfferId} успешно подтвержден`);
                    resolve({
                      success: true,
                      message: 'Trade offer принят и подтвержден',
                      status: 'accepted'
                    });
                  });
                } else {
                  logger.warn(`Подтверждение для trade offer ${tradeOfferId} не найдено`);
                  resolve({
                    success: true,
                    message: 'Trade offer принят, но подтверждение не найдено',
                    status: 'pending_confirmation'
                  });
                }
              });
            } else {
              resolve({
                success: true,
                message: 'Trade offer успешно принят',
                status: 'accepted'
              });
            }
          });
        });
      });
    } catch (error) {
      logger.error(`Критическая ошибка при принятии trade offer ${tradeOfferId}:`, error);
      return {
        success: false,
        message: `Критическая ошибка: ${error.message}`
      };
    }
  }

  // Метод для получения входящих trade offers
  async getIncomingTradeOffers() {
    try {
      if (!this.loggedIn) {
        logger.error('Бот не авторизован для получения trade offers');
        return {
          success: false,
          message: 'Бот не авторизован'
        };
      }

      return new Promise((resolve, reject) => {
        this.manager.getOffers(1, (err, sent, received) => { // 1 = EOfferFilter.ActiveOnly
          if (err) {
            logger.error('Ошибка при получении trade offers:', err);
            return resolve({
              success: false,
              message: `Ошибка получения trade offers: ${err.message}`
            });
          }

          logger.info(`Получено ${received.length} входящих trade offers`);
          resolve({
            success: true,
            received: received,
            sent: sent
          });
        });
      });
    } catch (error) {
      logger.error('Критическая ошибка при получении trade offers:', error);
      return {
        success: false,
        message: `Критическая ошибка: ${error.message}`
      };
    }
  }

  // Метод для корректного закрытия сервиса
  async shutdown() {
    logger.info('Завершение работы Steam бота...');
    if (this.client && this.client.loggedOn) {
      logger.info('Выполняется выход из Steam...');
      this.client.logOff();
      logger.info('Выход из Steam выполнен');
    }

    // Остановка подтверждений
    if (this.community) {
      try {
        this.community.stopConfirmationChecker();
        logger.info('Проверка подтверждений остановлена');
      } catch (error) {
        logger.error('Ошибка при остановке проверки подтверждений:', error);
      }
    }

    return true;
  }

  // Инициализации бота - для повторного использования
  async initialize() {
    if (this.loggedIn) {
      logger.info('Бот уже инициализирован и авторизован');
      return true;
    }

    try {
      await this.login();
      logger.info('Бот инициализирован успешно');
      return true;
    } catch (error) {
      logger.error('Ошибка при инициализации бота:', error);
      throw error;
    }
  }

  // Получение session данных для Steam Market
  getSessionData() {
    if (!this.loggedIn || !this.sessionId || !this.steamLoginSecure) {
      throw new Error('Steam session данные недоступны. Требуется авторизация.');
    }

    return {
      sessionId: this.sessionId,
      steamLoginSecure: this.steamLoginSecure,
      steamId: this.client.steamID.getSteamID64(),
      cookies: this.cookies
    };
  }

  // Проверка валидности session
  isSessionValid() {
    return this.loggedIn && this.sessionId && this.steamLoginSecure;
  }
}

module.exports = SteamBot;
