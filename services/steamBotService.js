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
  constructor(accountName, password, sharedSecret, identitySecret) {
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
          return reject(err);
        }
        logger.info(`Trade offer sent. Status: ${status}, Offer ID: ${offer.id}`);
        try {
          await this.community.acceptConfirmationForObject(this.identitySecret, offer.id);
          logger.info(`Trade offer confirmed: ${offer.id}`);
        } catch (confirmErr) {
          logger.error('Failed to confirm trade offer:', confirmErr);
          return reject(confirmErr);
        }
        resolve({
          status,
          offerId: offer.id,
          offer
        });
      });
    });
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
}

module.exports = SteamBot;
