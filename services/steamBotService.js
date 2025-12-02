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
let loggingIn = false;

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

  setupTradeOfferEvents() {
    this.manager.on('newOffer', (offer) => {
      logger.info(`Получено новое торговое предложение #${offer.id} от ${offer.partner.getSteamID64()}`);
    });

    this.manager.on('sentOfferChanged', (offer, oldState) => {
      logger.info(`Изменение статуса трейда #${offer.id}: ${oldState} -> ${offer.state}`);
    });

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

    this.manager.on('sentOfferDeclined', (offer) => {
      logger.warn(`Трейд #${offer.id} отклонен пользователем!`);
    });
  }

  setupAutoConfirmation() {
    this.community.on('confKeyNeeded', (tag, callback) => {
      logger.info('Требуется ключ подтверждения');
      const time = Math.floor(Date.now() / 1000);
      const confirmationKey = SteamTotp.getConfirmationKey(this.identitySecret, time, tag);
      callback(null, confirmationKey);
    });

    this.community.on('newConfirmation', (confirmation) => {
      logger.info(`Новое подтверждение: ${confirmation.type} для ${confirmation.creator}`);

      if (confirmation.type === 2) {
        logger.info(`Автоматическое подтверждение трейда #${confirmation.creator}`);

        confirmation.respond(true, (err) => {
          if (err) {
            logger.error(`Ошибка подтверждения трейда #${confirmation.creator}:`, err);
          } else {
            logger.info(`✅ Трейд #${confirmation.creator} подтвержден автоматически`);
          }
        });
      }
    });

    this.community.on('confirmationCheckerStarted', () => {
      logger.info('Confirmation Checker запущен');
      this.confirmationCheckerReady = true;
    });

    // Дополнительный обработчик для старых версий
    this.community.on('confKeyNeeded', (tag, callback) => {
      logger.info(`Генерация ключа подтверждения для tag: ${tag}`);
      const time = Math.floor(Date.now() / 1000);
      const key = SteamTotp.getConfirmationKey(this.identitySecret, time, tag);
      callback(null, key);
    });
  }

  async waitForConfirmationChecker(timeout = 15000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkReady = () => {
        if (this.confirmationCheckerReady) {
          logger.info('Confirmation checker готов к работе');
          resolve(true);
          return;
        }

        if (Date.now() - startTime > timeout) {
          logger.warn('Confirmation checker не готов после ожидания');
          resolve(false);
          return;
        }

        logger.info('Ожидание готовности confirmation checker...');
        setTimeout(checkReady, 1000);
      };

      checkReady();
    });
  }

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

  async confirmTradeOffer(offerId, maxRetries = 5) {
    logger.info(`Подтверждение трейда #${offerId}...`);

    // Метод 1: Автоматическое подтверждение через Confirmation Checker
    if (this.confirmationCheckerReady) {
      logger.info('Используем автоматическое подтверждение...');
      const autoResult = await this._tryAutoConfirm(offerId);
      if (autoResult.success) {
        return autoResult;
      }
    }

    // Метод 2: Ручное подтверждение через Steam Community API
    logger.info('Пробуем ручное подтверждение...');
    const manualResult = await this._tryManualConfirm(offerId, maxRetries);
    if (manualResult.success) {
      return manualResult;
    }

    // Метод 3: Подтверждение через мобильные подтверждения
    logger.info('Пробуем подтверждение через мобильный API...');
    const mobileResult = await this._tryMobileConfirm(offerId);
    if (mobileResult.success) {
      return mobileResult;
    }

    return {
      success: false,
      message: 'Не удалось подтвердить трейд всеми доступными методами'
    };
  }

  async _tryAutoConfirm(offerId) {
    try {
      // Ждем появления подтверждения
      await new Promise(resolve => setTimeout(resolve, 3000));

      return new Promise((resolve) => {
        let confirmed = false;
        const timeout = setTimeout(() => {
          if (!confirmed) {
            confirmed = true;
            resolve({ success: false, message: 'Timeout автоподтверждения' });
          }
        }, 10000);

        const checkConfirmations = () => {
          this.community.getConfirmations((err, confirmations) => {
            if (err || !confirmations) {
              if (!confirmed) {
                confirmed = true;
                clearTimeout(timeout);
                resolve({ success: false, message: 'Ошибка получения подтверждений' });
              }
              return;
            }

            const tradeConfirmation = confirmations.find(conf =>
              conf.type === 2 && conf.creator.toString() === offerId.toString()
            );

            if (tradeConfirmation) {
              tradeConfirmation.respond(true, (respondErr) => {
                if (!confirmed) {
                  confirmed = true;
                  clearTimeout(timeout);
                  if (respondErr) {
                    resolve({ success: false, message: respondErr.message });
                  } else {
                    resolve({ success: true, message: 'Трейд подтвержден автоматически' });
                  }
                }
              });
            } else {
              setTimeout(checkConfirmations, 1000);
            }
          });
        };

        checkConfirmations();
      });
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  async _tryManualConfirm(offerId, maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Попытка ручного подтверждения #${attempt}/${maxRetries}`);

        const result = await new Promise((resolve) => {
          this.community.acceptConfirmationForObject(this.identitySecret, offerId, (err) => {
            if (err) {
              resolve({ success: false, message: err.message });
            } else {
              resolve({ success: true, message: 'Трейд подтвержден вручную' });
            }
          });
        });

        if (result.success) {
          return result;
        }

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      } catch (error) {
        logger.warn(`Ошибка попытки ${attempt}: ${error.message}`);
      }
    }

    return { success: false, message: 'Все попытки ручного подтверждения исчерпаны' };
  }

  async _tryMobileConfirm(offerId) {
    try {
      const time = Math.floor(Date.now() / 1000);
      const confirmationKey = SteamTotp.getConfirmationKey(this.identitySecret, time, 'conf');

      return new Promise((resolve) => {
        this.community.getConfirmations(time, confirmationKey, (err, confirmations) => {
          if (err || !confirmations) {
            return resolve({ success: false, message: 'Ошибка получения мобильных подтверждений' });
          }

          const tradeConfirmation = confirmations.find(conf =>
            conf.type === 2 && conf.creator.toString() === offerId.toString()
          );

          if (!tradeConfirmation) {
            return resolve({ success: false, message: 'Подтверждение не найдено' });
          }

          const acceptKey = SteamTotp.getConfirmationKey(this.identitySecret, time, 'allow');
          tradeConfirmation.respond(time, acceptKey, true, (respondErr) => {
            if (respondErr) {
              resolve({ success: false, message: respondErr.message });
            } else {
              resolve({ success: true, message: 'Трейд подтвержден через мобильный API' });
            }
          });
        });
      });
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

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

  async findItemInInventory(marketHashName, exterior = null, appId = 730, contextId = 2) {
    try {
      const inventory = await this.getInventory(appId, contextId, true);

      if (exterior) {
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

  async checkPartnerProfile(partnerSteamId) {
    return new Promise((resolve) => {
      logger.info(`Проверка профиля получателя: ${partnerSteamId}`);

      this.community.getSteamUser(partnerSteamId, (err, user) => {
        if (err) {
          logger.warn(`Не удалось получить информацию о профиле: ${err.message}`);
          return resolve({
            accessible: false,
            error: err.message,
            canTrade: false
          });
        }

        const profileInfo = {
          accessible: true,
          steamId: partnerSteamId,
          profileName: user.name || 'Unknown',
          profileState: user.privacyState || 'Unknown',
          canTrade: user.privacyState === 3,
          tradeEnabled: !user.tradeBanState || user.tradeBanState === 'None',
          vacBanned: user.vacBanned || false,
          communityBanned: user.communityBanned || false
        };

        logger.info(`Информация о профиле: ${JSON.stringify(profileInfo)}`);
        resolve(profileInfo);
      });
    });
  }

  async validateTradeUrl(tradeUrl) {
    const urlPattern = /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=(\d+)&token=([a-zA-Z0-9_-]+)$/;
    const match = tradeUrl.match(urlPattern);

    if (!match) {
      return {
        valid: false,
        error: 'Неверный формат Trade URL'
      };
    }

    const partnerId = match[1];
    const token = match[2];

    if (partnerId.length < 8 || partnerId.length > 12) {
      return {
        valid: false,
        error: 'Некорректный partner ID'
      };
    }

    if (token.length < 8) {
      return {
        valid: false,
        error: 'Слишком короткий токен'
      };
    }

    return {
      valid: true,
      partnerId,
      token,
      partnerSteamId: (BigInt(partnerId) + BigInt('76561197960265728')).toString()
    };
  }

  async sendTradeOfferWithToken(partnerSteamId, token, itemsToGive, itemsToReceive = []) {
    return new Promise(async (resolve, reject) => {
      if (!this.loggedIn) {
        return resolve({
          success: false,
          message: 'Бот не авторизован'
        });
      }

      if (!this.manager) {
        return resolve({
          success: false,
          message: 'Trade Manager не инициализирован'
        });
      }

      // Проверяем API ключ
      if (!this.manager.apiKey) {
        logger.error('❌ API ключ не установлен для Trade Manager');
        return resolve({
          success: false,
          message: 'API ключ Steam не настроен'
        });
      }

      logger.info(`Создание торгового предложения для ${partnerSteamId}. Отправка ${itemsToGive.length} предметов, получение ${itemsToReceive.length} предметов.`);
      logger.info(`📋 API Key установлен: ${this.manager.apiKey ? 'Да' : 'Нет'}`);
      logger.info(`📋 Steam ID бота: ${this.client.steamID ? this.client.steamID.getSteamID64() : 'Неизвестен'}`);
      logger.info(`📋 Токен получателя: ${token}`);

      // Создаем оффер и устанавливаем токен
      const offer = this.manager.createOffer(partnerSteamId);

      // ВАЖНО: Устанавливаем токен из Trade URL
      if (token) {
        offer.setToken(token);
        logger.info(`✅ Токен установлен для трейд-оффера`);
      }

      if (itemsToGive.length > 0) {
        offer.addMyItems(itemsToGive);
      }
      if (itemsToReceive.length > 0) {
        offer.addTheirItems(itemsToReceive);
      }

      offer.setMessage('Вывод предмета с сайта ChiBox');

      offer.send(async (err, status) => {
        if (err) {
          logger.error('Failed to send trade offer:', err);

          let errorMessage = err.message;
          let possibleReasons = [];

          if (err.eresult === 15) {
            errorMessage = 'Не удалось отправить трейд-оффер (eresult: 15)';
            possibleReasons = [
              '• Trade URL получателя изменился или неверен',
              '• У получателя приватный профиль или VAC бан',
              '• У получателя нет Steam Guard (7 дней)',
              '• Получатель заблокировал вас',
              '• У вас (бота) нет Mobile Authenticator',
              '• API ключ неверный или истек'
            ];
            logger.error('❌ Возможные причины ошибки eresult:15:');
            possibleReasons.forEach(reason => logger.error(reason));
          } else if (err.eresult === 20) {
            errorMessage = 'Профиль получателя недоступен или ограничен';
          } else if (err.eresult === 25) {
            errorMessage = 'У получателя есть ограничения на торговлю';
          } else if (err.eresult === 16) {
            errorMessage = 'У вас (бота) есть trade hold или нет Mobile Authenticator';
          }

          return resolve({
            success: false,
            message: errorMessage,
            eresult: err.eresult,
            possibleReasons,
            error: err
          });
        }

        logger.info(`Trade offer sent. Status: ${status}, Offer ID: ${offer.id}`);

        await new Promise(resolve => setTimeout(resolve, 2000));

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

  // Старый метод для обратной совместимости (без токена)
  async sendTradeOffer(partnerSteamId, itemsToGive, itemsToReceive = []) {
    // Вызываем новый метод без токена
    return this.sendTradeOfferWithToken(partnerSteamId, null, itemsToGive, itemsToReceive);
  }

  // Метод для отправки трейда с Trade URL (удобная обертка) с retry-логикой
  async sendTrade(tradeUrl, assetIds, inventory = null, maxRetries = 3) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Попытка отправки трейда #${attempt}/${maxRetries}`);

        const partnerMatch = tradeUrl.match(/partner=(\d+)/);
        if (!partnerMatch) {
          return {
            success: false,
            message: 'Неверный формат Trade URL - не найден partner ID'
          };
        }

        const partnerId = partnerMatch[1];
        const partnerSteamId = (BigInt(partnerId) + BigInt('76561197960265728')).toString();

        logger.info(`Извлечен partner ID: ${partnerId}, SteamID64: ${partnerSteamId}`);

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

        const result = await this.sendTradeOffer(partnerSteamId, itemsToGive, []);

        if (result.success) {
          return result;
        }

        lastError = result;

        if (result.eresult === 15 || result.eresult === 20 || result.eresult === 84) {
          logger.warn(`Ошибка ${result.eresult} - возможна временная проблема. Повтор через ${attempt * 2} секунд...`);

          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, attempt * 2000));
            continue;
          }
        } else {
          break;
        }

      } catch (error) {
        lastError = { success: false, message: error.message, error };
        logger.error(`Ошибка при отправке трейда (попытка ${attempt}):`, error);

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
        }
      }
    }

    return lastError || {
      success: false,
      message: 'Неизвестная ошибка при отправке трейда'
    };
  }

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
        this.manager.getOffers(1, (err, sent, received) => {
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

  async shutdown() {
    logger.info('Завершение работы Steam бота...');
    if (this.client && this.client.loggedOn) {
      logger.info('Выполняется выход из Steam...');
      this.client.logOff();
      logger.info('Выход из Steam выполнен');
    }

    if (this.community) {
      try {
        this.community.stopConfirmationChecker();
        logger.info('Проверка подтверждений остановлена');
      } catch (error) {
        logger.error('Ошибка при остановке проверки подтверждений:', error);
      }
    }

    loggingIn = false;
    hasLoggedIn = false;

    return true;
  }

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

  isSessionValid() {
    return this.loggedIn && this.sessionId && this.steamLoginSecure;
  }

  async getProfileInfo() {
    try {
      return new Promise((resolve, reject) => {
        if (!this.loggedIn) {
          return reject(new Error('Бот не авторизован'));
        }

        const steamId = this.client.steamID;
        resolve({
          steamId: steamId.getSteamID64(),
          accountId: steamId.accountid,
          loggedIn: this.loggedIn,
          steamLevel: this.client.accountInfo?.level || 'unknown',
          country: this.client.accountInfo?.country || 'unknown',
          wallet: this.client.wallet || 'unknown'
        });
      });
    } catch (error) {
      logger.error('Ошибка получения информации о профиле:', error);
      return { error: error.message };
    }
  }

  async getTradeRestrictions() {
    try {
      return new Promise((resolve) => {
        if (!this.loggedIn) {
          return resolve({ error: 'Бот не авторизован' });
        }

        this.community.getUserInventoryContexts(this.client.steamID, (err, contexts) => {
          if (err) {
            return resolve({
              error: err.message,
              canTrade: false,
              tradeHold: 'unknown'
            });
          }

          resolve({
            canTrade: true,
            contexts: contexts,
            tradeHold: false,
            steamGuardEnabled: !!this.sharedSecret
          });
        });
      });
    } catch (error) {
      logger.error('Ошибка проверки ограничений торговли:', error);
      return { error: error.message };
    }
  }

  async getConfirmationCheckerStatus() {
    try {
      return {
        ready: this.confirmationCheckerReady,
        enabled: !!this.identitySecret,
        interval: 10000,
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Ошибка проверки confirmation checker:', error);
      return { error: error.message };
    }
  }

  async testTradeOfferCreation(partnerSteamId) {
    try {
      if (!this.loggedIn) {
        return { error: 'Бот не авторизован' };
      }

      const offer = this.manager.createOffer(partnerSteamId);

      return {
        success: true,
        offerCreated: true,
        partnerId: partnerSteamId,
        managerReady: !!this.manager,
        apiKeySet: !!this.manager.apiKey
      };
    } catch (error) {
      logger.error('Ошибка создания тестового трейда:', error);
      return { error: error.message };
    }
  }

  async testSteamApi() {
    try {
      if (!this.steamApiKey) {
        return { error: 'Steam API ключ не настроен' };
      }

      return new Promise((resolve) => {
        const request = require('request');
        const url = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${this.steamApiKey}&steamids=${this.client.steamID.getSteamID64()}`;

        request(url, (error, response, body) => {
          if (error) {
            return resolve({ error: error.message });
          }

          try {
            const data = JSON.parse(body);
            resolve({
              apiWorking: true,
              response: data.response?.players?.[0] || 'No player data'
            });
          } catch (parseError) {
            resolve({ error: 'Ошибка парсинга ответа API' });
          }
        });
      });
    } catch (error) {
      logger.error('Ошибка тестирования Steam API:', error);
      return { error: error.message };
    }
  }

  async checkProfile(steamId) {
    try {
      return new Promise((resolve) => {
        if (!this.loggedIn) {
          return resolve({ error: 'Бот не авторизован', canTrade: false });
        }

        this.community.getUserInventory(steamId, 730, 2, false, (err, inventory, currencies) => {
          if (err) {
            if (err.message.includes('private')) {
              return resolve({
                error: 'Приватный профиль',
                canTrade: false,
                reason: 'Профиль закрыт или инвентарь приватный'
              });
            }
            if (err.message.includes('limited')) {
              return resolve({
                error: 'Ограниченный аккаунт',
                canTrade: false,
                reason: 'Аккаунт имеет ограничения'
              });
            }
            return resolve({
              error: err.message,
              canTrade: false,
              reason: `Ошибка доступа: ${err.message}`
            });
          }

          resolve({
            canTrade: true,
            inventoryItems: inventory ? inventory.length : 0,
            profileAccessible: true
          });
        });
      });
    } catch (error) {
      logger.error('Ошибка проверки профиля:', error);
      return { error: error.message, canTrade: false };
    }
  }

  async login() {
    if (hasLoggedIn) {
      logger.info('Already logged in, skipping login.');
      return;
    }
    
    if (loggingIn) {
      logger.warn('Login already in progress, waiting...');
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (hasLoggedIn) {
            clearInterval(checkInterval);
            logger.info('Login completed by another process');
            resolve();
          }
        }, 1000);
        
        setTimeout(() => {
          clearInterval(checkInterval);
          logger.warn('Login wait timeout');
          resolve();
        }, 30000);
      });
    }
    
    loggingIn = true;
    
    return new Promise(async (resolve, reject) => {
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
      });

      this.client.once('webSession', async (sessionID, cookies) => {
        logger.info('Steam webSession received, setting cookies to manager & community...');
        this.manager.setCookies(cookies);
        this.community.setCookies(cookies);

        this.community.startConfirmationChecker(10000, this.identitySecret);
        logger.info('Автоматическое подтверждение настроено через startConfirmationChecker');

        if (this.steamApiKey) {
          this.manager.apiKey = this.steamApiKey;
          logger.info('Steam API key set for Trade Manager');
        } else {
          logger.warn('Steam API key not provided - trade functionality may be limited');
        }

        this.sessionId = sessionID;
        this.cookies = cookies;

        const steamLoginSecureCookie = cookies.find(cookie => cookie.startsWith('steamLoginSecure='));
        if (steamLoginSecureCookie) {
          this.steamLoginSecure = steamLoginSecureCookie.replace('steamLoginSecure=', '').split(';')[0];
          logger.info('Steam session data extracted successfully');
        }

        logger.info('Cookies set, confirmation checker started, bot now fully operational.');

        logger.info('Ожидание инициализации confirmation checker...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        await this.waitForConfirmationChecker(15000);

        logger.info('✅ Steam bot полностью готов к работе с подтверждениями');
        
        loggingIn = false;
        resolve();
      });

      this.client.once('error', (err) => {
        logger.error('Steam login error:', err);
        loggingIn = false;
        hasLoggedIn = false;
        reject(err);
      });

      this.client.once('steamGuard', (domain, callback) => {
        if (!domain) {
          const code = SteamTotp.generateAuthCode(this.sharedSecret);
          logger.info('Generated Steam Guard (2FA Mobile) code:');
          callback(code);
        } else {
          logger.error('Steam Guard requires code from email:', domain);
          callback(null);
          loggingIn = false;
        }
      });
    });
  }

  getTradeStateText(state) {
    const states = {
      1: 'Invalid',
      2: 'Active',
      3: 'Accepted',
      4: 'Countered',
      5: 'Expired',
      6: 'Canceled',
      7: 'Declined',
      8: 'InvalidItems',
      9: 'ConfirmationRequired',
      10: 'CanceledBySecondFactor',
      11: 'InEscrow'
    };

    return states[state] || `Unknown(${state})`;
  }
}

module.exports = SteamBot;
