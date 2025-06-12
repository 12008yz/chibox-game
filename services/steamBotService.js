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
    this.confirmationCheckerReady = false;

    // Регистрируем обработчик событий для трейдов
    this.setupTradeOfferEvents();

    // Настраиваем автоматическое подтверждение
    this.setupAutoConfirmation();

    instance = this;
  }

  // Настройка обработчиков событий для трейдов
  setupTradeOfferEvents() {
    // Событие при получении нового трейда
    this.manager.on('newOffer', (offer) => {
      logger.info(`Получено новое торговое предложение #${offer.id} от ${offer.partner.getSteamID64()}`);
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

  // Настройка автоматического подтверждения
  setupAutoConfirmation() {
    // Событие появления новых подтверждений
    this.community.on('confKeyNeeded', (tag, callback) => {
      logger.info('Требуется ключ подтверждения');
      const time = Math.floor(Date.now() / 1000);
      const confirmationKey = SteamTotp.getConfirmationKey(this.identitySecret, time, tag);
      callback(null, confirmationKey);
    });

    // Автоматическое подтверждение исходящих трейдов
    this.community.on('newConfirmation', (confirmation) => {
      logger.info(`Новое подтверждение: ${confirmation.type} для ${confirmation.creator}`);

      // Подтверждаем исходящие трейды автоматически
      if (confirmation.type === 2) { // 2 = trade confirmation
        logger.info(`Автоматическое подтверждение трейда #${confirmation.creator}`);
        this.community.acceptConfirmationForObject(this.identitySecret, confirmation.creator, (err) => {
          if (err) {
            logger.error(`Ошибка автоподтверждения трейда #${confirmation.creator}:`, err);
          } else {
            logger.info(`✅ Трейд #${confirmation.creator} автоматически подтвержден`);
          }
        });
      }
    });

    // Событие готовности confirmation checker
    this.community.on('confirmationCheckerStarted', () => {
      logger.info('✅ Confirmation checker запущен и готов к работе');
      this.confirmationCheckerReady = true;
    });
  }

  // Ожидание готовности confirmation checker
  async waitForConfirmationChecker(timeout = 10000) {
    const startTime = Date.now();
    while (!this.confirmationCheckerReady && (Date.now() - startTime) < timeout) {
      logger.info('Ожидание готовности confirmation checker...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    if (!this.confirmationCheckerReady) {
      logger.warn('Confirmation checker не готов после ожидания');
      return false;
    }
    
    logger.info('Confirmation checker готов к работе');
    return true;
  }

  // Метод для подтверждения всех ожидающих подтверждений
  async confirmAllPendingConfirmations() {
    logger.info('Проверка и подтверждение всех ожидающих подтверждений...');

    return new Promise((resolve) => {
      const time = Math.floor(Date.now() / 1000);
      const allowKey = SteamTotp.getConfirmationKey(this.identitySecret, time, 'allow');

      this.community.getConfirmations(time, allowKey, (err, confirmations) => {
        if (err) {
          logger.error('Ошибка при получении списка подтверждений:', err);
          return resolve(false);
        }

        if (!confirmations || confirmations.length === 0) {
          logger.info('Нет ожидающих подтверждений');
          return resolve(true);
        }

        logger.info(`Найдено ${confirmations.length} ожидающих подтверждений`);
        let confirmedCount = 0;
        let totalToConfirm = 0;

        confirmations.forEach(confirmation => {
          // Подтверждаем только исходящие трейды (type 2)
          if (confirmation.type === 2) {
            totalToConfirm++;
            logger.info(`Подтверждение трейда #${confirmation.creator}...`);

            const acceptTime = Math.floor(Date.now() / 1000);
            const acceptKey = SteamTotp.getConfirmationKey(this.identitySecret, acceptTime, 'accept');

            this.community.respondToConfirmation(confirmation.id, confirmation.key, acceptTime, acceptKey, true, (confirmErr) => {
              if (confirmErr) {
                logger.error(`Ошибка подтверждения трейда #${confirmation.creator}:`, confirmErr);
              } else {
                logger.info(`✅ Трейд #${confirmation.creator} успешно подтвержден`);
                confirmedCount++;
              }

              // Проверяем, все ли подтверждения обработаны
              if (confirmedCount + (confirmations.filter(c => c.type === 2).length - totalToConfirm) >= totalToConfirm) {
                resolve(confirmedCount > 0);
              }
            });
          }
        });

        if (totalToConfirm === 0) {
          resolve(true);
        }
      });
    });
  }

  // Улучшенный метод для подтверждения конкретного трейда с retry
  async confirmTradeOffer(offerId, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`Попытка подтверждения трейда #${offerId} (попытка ${attempt}/${maxRetries})...`);
      
      const result = await this._tryConfirmTrade(offerId);
      
      if (result.success) {
        return result;
      }
      
      if (attempt < maxRetries) {
        logger.warn(`Попытка ${attempt} неудачна, ждем 3 секунды перед повтором...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    // Последняя попытка через ручное подтверждение
    logger.info(`Все автоматические попытки исчерпаны, пробуем ручное подтверждение трейда #${offerId}...`);
    return await this._manualConfirmTrade(offerId);
  }

  // Приватный метод для одной попытки подтверждения
  async _tryConfirmTrade(offerId) {
    return new Promise((resolve) => {
      this.manager.getOffer(offerId, (err, offer) => {
        if (err) {
          logger.error(`Ошибка получения трейда #${offerId}:`, err);
          return resolve({
            success: false,
            message: err.message
          });
        }

        if (offer.state !== 2) {
          if (offer.state === 9) {
            logger.info(`✅ Трейд #${offerId} уже завершен (принят получателем)`);
            return resolve({
              success: true,
              message: 'Трейд уже завершен'
            });
          } else if (offer.state === 3) {
            logger.info(`✅ Трейд #${offerId} уже принят`);
            return resolve({
              success: true,
              message: 'Трейд уже принят'
            });
          } else {
            logger.info(`Трейд #${offerId} в состоянии ${offer.state} (не требует подтверждения)`);
            return resolve({
              success: true,
              message: `Трейд в состоянии ${offer.state}`
            });
          }
        }

        // Проверяем что метод confirm существует
        if (typeof offer.confirm !== 'function') {
          logger.warn(`Метод confirm недоступен для трейда #${offerId}`);
          return resolve({
            success: false,
            message: 'Метод confirm недоступен'
          });
        }

        offer.confirm((confirmErr) => {
          if (confirmErr) {
            logger.error(`Ошибка подтверждения трейда #${offerId}:`, confirmErr);
            return resolve({
              success: false,
              message: confirmErr.message
            });
          }

          logger.info(`✅ Трейд #${offerId} успешно подтвержден`);
          resolve({
            success: true,
            message: 'Трейд подтвержден'
          });
        });
      });
    });
  }

  // Ручное подтверждение через API
  async _manualConfirmTrade(offerId) {
    return new Promise((resolve) => {
      const time = Math.floor(Date.now() / 1000);
      const allowKey = SteamTotp.getConfirmationKey(this.identitySecret, time, 'allow');

      this.community.getConfirmations(time, allowKey, (err, confirmations) => {
        if (err) {
          logger.error(`Ошибка получения подтверждений для трейда #${offerId}:`, err);
          return resolve({
            success: false,
            message: 'Ошибка получения подтверждений'
          });
        }

        const confirmation = confirmations.find(conf => 
          conf.type === 2 && conf.creator === offerId.toString()
        );

        if (!confirmation) {
          logger.warn(`Подтверждение для трейда #${offerId} не найдено`);
          return resolve({
            success: false,
            message: 'Подтверждение не найдено'
          });
        }

        const acceptTime = Math.floor(Date.now() / 1000);
        const acceptKey = SteamTotp.getConfirmationKey(this.identitySecret, acceptTime, 'accept');

        this.community.respondToConfirmation(confirmation.id, confirmation.key, acceptTime, acceptKey, true, (confirmErr) => {
          if (confirmErr) {
            logger.error(`Ошибка ручного подтверждения трейда #${offerId}:`, confirmErr);
            return resolve({
              success: false,
              message: confirmErr.message
            });
          }

          logger.info(`✅ Трейд #${offerId} подтвержден вручную`);
          resolve({
            success: true,
            message: 'Трейд подтвержден вручную'
          });
        });
      });
    });
  }

  async login() {
    if (hasLoggedIn) {
      logger.info('Already logged in, skipping login.');
      return;
    }
    return new Promise(async (resolve, reject) => {
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

      this.client.once('webSession', async (sessionID, cookies) => {
        logger.info('Steam webSession received, setting cookies to manager & community...');
        this.manager.setCookies(cookies);
        this.community.setCookies(cookies);
        
        // Запускаем confirmation checker
        this.community.startConfirmationChecker(10000, this.identitySecret);
        logger.info('Автоматическое подтверждение настроено через startConfirmationChecker');

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
        
        // ВАЖНО: Ждем инициализации confirmation checker
        logger.info('Ожидание инициализации confirmation checker...');
        await new Promise(resolve => setTimeout(resolve, 8000)); // 8 секунд задержки
        
        // Дополнительная проверка готовности
        await this.waitForConfirmationChecker(5000);
        
        logger.info('✅ Steam bot полностью готов к работе с подтверждениями');
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
          logger.info('Generated Steam Guard (2FA Mobile) code:');
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

  // Отправка торгового предложения с автоподтверждением
  async sendTradeOffer(partnerSteamId, itemsToGive, itemsToReceive = []) {
    return new Promise(async (resolve, reject) => {
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

        // Ждем немного перед попыткой подтверждения
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Пытаемся подтвердить трейд
        const confirmResult = await this.confirmTradeOffer(offer.id);
        
        resolve({
          success: true,
          tradeOfferId: offer.id,
          status,
          offer,
          confirmationResult: confirmResult
        });
      });
    });
  }

  // Метод для отправки трейда с Trade URL (удобная обертка)
  async sendTrade(tradeUrl, assetIds, inventory = null) {
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
      const botInventory = inventory || await this.getInventory();
      const itemsToGive = [];

      for (const assetId of assetIds) {
        const item = botInventory.find(i => i.assetid === assetId.toString());
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

  // Проверка статуса трейда
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