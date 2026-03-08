#!/usr/bin/env node

/**
 * UNIFIED WITHDRAWAL PROCESSOR
 *
 * Приоритетная система вывода предметов:
 * 1. Проверяем инвентарь Steam бота → если есть предмет, отправляем
 * 2. Если нет в Steam → ищем на PlayerOk → покупаем если выгодно
 * 3. Если нигде не найден → withdrawal failed
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Withdrawal, User, UserInventory, Item } = require('../models');
const SteamBot = require('../services/steamBotService');
const PlayerOkBot = require('../services/playerokBotService');
const SteamPriceService = require('../services/steamPriceService');
const steamPriceService = new SteamPriceService(process.env.STEAM_API_KEY);
const steamBotConfig = require('../config/steam_bot.js');
const winston = require('winston');
const { Op } = require('sequelize');
const { getTradeOfferStateFromApi } = require('../utils/steamTradeHelper');
const { applyWithdrawalOutcome } = require('../services/withdrawalOutcomeService');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'withdrawal-processor.log' })
  ],
});

// Конфигурация
const CONFIG = {
  CHECK_INTERVAL: 30000, // Проверять каждые 30 секунд
  STEAM_BOT_ENABLED: false, // Пока только PlayerOk
  PLAYEROK_ENABLED: true, // Вывод через PlayerOk (поиск → покупка → Trade URL в комментарий)
  MIN_MARGIN_PERCENT: 0, // Минимальная маржа для PlayerOk (0% = главное не дороже)
  MAX_WITHDRAWALS_PER_CYCLE: 10 // Обрабатывать макс 10 заявок за цикл
};

class WithdrawalProcessor {
  constructor() {
    this.steamBot = null;
    this.playerokBot = null;
    this.isRunning = false;
    this.processedWithdrawals = new Set();
  }

  /**
   * Логин в Steam с повторными попытками при AccountLoginDeniedThrottle (eresult 87).
   * Steam блокирует частые попытки входа — ждём 10 минут и пробуем снова.
   */
  async steamLoginWithThrottleRetry(maxAttempts = 3, throttleWaitMs = 10 * 60 * 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.steamBot.login();
        return true;
      } catch (err) {
        const isThrottle = (err.message && (err.message.includes('AccountLoginDeniedThrottle') || err.message.includes('RateLimitExceeded'))) || err.eresult === 87 || err.eresult === 84;
        if (isThrottle && attempt < maxAttempts) {
          logger.warn(`⚠️ Steam throttle (слишком частые входы). Ждём ${throttleWaitMs / 60000} мин перед попыткой ${attempt + 1}/${maxAttempts}...`);
          await new Promise(r => setTimeout(r, throttleWaitMs));
        } else if (isThrottle && attempt === maxAttempts) {
          logger.error(`❌ Steam throttle: все ${maxAttempts} попытки исчерпаны. Steam бот отключён до следующего перезапуска.`);
          return false;
        } else {
          throw err;
        }
      }
    }
    return false;
  }

  /**
   * Запуск процессора
   */
  async start() {
    try {
      logger.info('🚀 Запуск Unified Withdrawal Processor...');

      // Инициализируем Steam бота (если включен)
      if (CONFIG.STEAM_BOT_ENABLED) {
        logger.info('🔐 Инициализация Steam бота...');
        this.steamBot = new SteamBot(
          steamBotConfig.accountName,
          steamBotConfig.password,
          steamBotConfig.sharedSecret,
          steamBotConfig.identitySecret,
          steamBotConfig.steamApiKey
        );

        const steamLoginOk = await this.steamLoginWithThrottleRetry();
        if (!steamLoginOk) {
          logger.error('❌ Не удалось авторизовать Steam бота после повторных попыток');
          CONFIG.STEAM_BOT_ENABLED = false;
        } else {
          logger.info('✅ Steam бот авторизован');
          const restrictions = await this.steamBot.getTradeRestrictions();
          if (restrictions.error || !restrictions.canTrade) {
            logger.error('❌ Steam бот имеет ограничения на торговлю!');
            CONFIG.STEAM_BOT_ENABLED = false;
          }
        }
      }

      // Инициализируем PlayerOk бота (если включен)
      if (CONFIG.PLAYEROK_ENABLED) {
        logger.info('🔐 Инициализация PlayerOk бота...');
        this.playerokBot = new PlayerOkBot();

        const isLoggedIn = await this.playerokBot.init();

        if (!isLoggedIn) {
          logger.warn('⚠️ PlayerOk бот не авторизован, отключаем арбитраж');
          CONFIG.PLAYEROK_ENABLED = false;
        } else {
          logger.info('✅ PlayerOk бот авторизован');
        }
      }

      if (!CONFIG.STEAM_BOT_ENABLED && !CONFIG.PLAYEROK_ENABLED) {
        logger.error('❌ Оба метода вывода отключены! Завершаем работу.');
        process.exit(1);
      }

      this.isRunning = true;
      logger.info('✅ Процессор запущен и готов к работе');
      logger.info(`📊 Steam Bot: ${CONFIG.STEAM_BOT_ENABLED ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'}`);
      logger.info(`📊 PlayerOk: ${CONFIG.PLAYEROK_ENABLED ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'}`);

      // Запускаем цикл обработки
      await this.processLoop();

    } catch (error) {
      logger.error('❌ Критическая ошибка при запуске:', error);
      await this.stop();
      process.exit(1);
    }
  }

  /**
   * Основной цикл обработки withdrawals
   */
  async processLoop() {
    while (this.isRunning) {
      try {
        logger.info('\n' + '='.repeat(80));
        logger.info('🔍 Проверка pending withdrawals...');

        // Находим все pending withdrawals
        const withdrawals = await Withdrawal.findAll({
          where: {
            status: 'pending'
          },
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'username', 'steam_trade_url']
            },
            {
              model: UserInventory,
              as: 'items',
              include: [
                {
                  model: Item,
                  as: 'item',
                  attributes: ['id', 'name', 'price', 'steam_market_hash_name', 'image_url', 'rarity']
                }
              ]
            }
          ],
          order: [
            ['priority', 'DESC'],      // Сначала по приоритету (выше число = выше приоритет)
            ['request_date', 'ASC']    // Затем по дате (старые первыми)
          ],
          limit: CONFIG.MAX_WITHDRAWALS_PER_CYCLE
        });

        if (withdrawals.length === 0) {
          logger.info('ℹ️ Нет pending withdrawals');
        } else {
          logger.info(`📦 Найдено ${withdrawals.length} заявок на обработку`);

          for (const withdrawal of withdrawals) {
            // Пропускаем уже обработанные в этом цикле
            if (this.processedWithdrawals.has(withdrawal.id)) {
              continue;
            }

            await this.processWithdrawal(withdrawal);
            this.processedWithdrawals.add(withdrawal.id);

            // Пауза между обработкой
            await this.sleep(3000);
          }
        }

        // Проверяем заявки в статусе direct_trade_sent: принят ли трейд в Steam (state 3)
        await this.checkSentTradesAccepted();

        // Очищаем Set если стал большим
        if (this.processedWithdrawals.size > 1000) {
          this.processedWithdrawals.clear();
        }

        // Ждём перед следующей проверкой
        logger.info(`⏳ Ожидание ${CONFIG.CHECK_INTERVAL / 1000} секунд до следующей проверки...`);
        await this.sleep(CONFIG.CHECK_INTERVAL);

      } catch (error) {
        logger.error('❌ Ошибка в цикле обработки:', error);
        await this.sleep(10000);
      }
    }
  }

  /**
   * Проверяет заявки direct_trade_sent: если трейд принят (state 3) или
   * отклонён/истёк (6, 7) — обновляет заявку и инвентарь.
   * Сначала использует Steam бота (manager.getOffer), при недоступности — Web API.
   */
  async checkSentTradesAccepted() {
    const apiKey = process.env.STEAM_API_KEY || (steamBotConfig && steamBotConfig.steamApiKey);
    if (!apiKey && !this.steamBot) {
      logger.warn('⚠️ Проверка принятых трейдов пропущена: нет STEAM_API_KEY и бота');
      return;
    }

    const sent = await Withdrawal.findAll({
      where: { status: 'direct_trade_sent' },
      attributes: ['id', 'status', 'tracking_data', 'steam_trade_offer_id'],
    });

    if (sent.length === 0) return;

    logger.info(`🔍 Проверка принятых трейдов: ${sent.length} заявок direct_trade_sent`);

    for (const w of sent) {
      const offerId = w.tracking_data?.trade_offer_id || w.steam_trade_offer_id;
      if (!offerId) {
        logger.warn(`⚠️ Withdrawal ${w.id}: нет trade_offer_id (tracking_data: ${!!w.tracking_data?.trade_offer_id}, steam_trade_offer_id: ${w.steam_trade_offer_id ?? 'null'}), пропуск`);
        continue;
      }

      let state;
      if (this.steamBot && this.steamBot.loggedIn) {
        try {
          const result = await this.steamBot.getTradeOfferStatus(String(offerId));
          state = result != null ? result.state : undefined;
        } catch (_) {
          // fallback на Web API
        }
      }
      if ((state === undefined || state === null) && apiKey) {
        const resolved = await getTradeOfferStateFromApi(apiKey, String(offerId));
        if (!resolved.error) state = resolved.state;
        else logger.warn(`⚠️ Withdrawal ${w.id} offer #${offerId}: ${resolved.error}`);
      }
      if (state === undefined || state === null) continue;
      // 3 = Accepted, 6 = Canceled/Expired, 7 = Declined
      if (state === 3) {
        const withdrawal = await Withdrawal.findByPk(w.id);
        if (withdrawal && withdrawal.status === 'direct_trade_sent') {
          await applyWithdrawalOutcome(withdrawal, 'completed', 'Трейд принят пользователем');
          logger.info(`✅ Withdrawal ${w.id}: трейд #${offerId} принят, заявка завершена`);
        }
      } else if (state === 6 || state === 7) {
        const withdrawal = await Withdrawal.findByPk(w.id);
        if (withdrawal && withdrawal.status === 'direct_trade_sent') {
          const msg = state === 7 ? 'Трейд отклонен пользователем' : 'Трейд истек или отменен';
          await applyWithdrawalOutcome(withdrawal, 'failed', msg);
          logger.info(`❌ Withdrawal ${w.id}: трейд #${offerId} — ${msg}`);
        }
      }
      // state 2 = Accepted (в другой нумерации) или ещё в ожидании — не логируем
    }
  }

  /**
   * Обработка одной заявки на вывод (ПРИОРИТЕТНАЯ СИСТЕМА)
   */
  async processWithdrawal(withdrawal) {
    try {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`📋 Обработка withdrawal ID: ${withdrawal.id}`);
      logger.info(`👤 Пользователь: ${withdrawal.user.username}`);

      // Обновляем статус
      await withdrawal.update({
        status: 'processing',
        processing_date: new Date()
      });

      // Проверяем каждый предмет в заявке
      for (const inventoryItem of withdrawal.items) {
        const item = inventoryItem.item;

        if (!item) {
          logger.warn(`⚠️ Предмет не найден для inventory item ${inventoryItem.id}`);
          continue;
        }

        logger.info(`\n🎮 Предмет: ${item.name}`);
        logger.info(`💰 Цена в ChiBox: ${item.price}₽`);

        // ПРИОРИТЕТ 1: Проверяем инвентарь Steam бота
        if (CONFIG.STEAM_BOT_ENABLED) {
          logger.info('🔍 [Приоритет 1] Проверка инвентаря Steam бота...');

          const foundInSteam = await this.tryProcessViaSteam(withdrawal, item);

          if (foundInSteam) {
            logger.info('✅ Предмет найден в Steam боте и отправлен!');
            return; // Успешно обработано через Steam
          }

          logger.info('⚠️ Предмет не найден в Steam боте');
        }

        // ПРИОРИТЕТ 2: Поиск на PlayerOk
        if (CONFIG.PLAYEROK_ENABLED) {
          logger.info('🔍 [Приоритет 2] Поиск на PlayerOk...');

          const foundOnPlayerOk = await this.tryProcessViaPlayerOk(withdrawal, item);

          if (foundOnPlayerOk) {
            logger.info('✅ Предмет найден на PlayerOk и куплен!');
            return; // Успешно обработано через PlayerOk
          }

          logger.info('⚠️ Предмет не найден на PlayerOk или слишком дорогой');
        }

        // Если не нашли ни в Steam, ни на PlayerOk — ставим статус "ожидание выбора пользователя"
        logger.warn('⚠️ Предмет не найден у бота. Создаём уведомление с выбором: ChiCoins или ожидание.');

        const itemPrice = parseFloat(item.price) || 0;
        const itemName = item.name || 'Предмет';
        const trackingData = withdrawal.tracking_data || {};
        await withdrawal.update({
          status: 'item_not_in_stock',
          failed_reason: null,
          tracking_data: {
            ...trackingData,
            item_not_in_stock_at: new Date().toISOString(),
            item_name: itemName,
            item_value: itemPrice,
            item_id: item.id
          }
        });

        const Notification = Withdrawal.sequelize.models.Notification;
        if (Notification) {
          const existingList = await Notification.findAll({
            where: {
              user_id: withdrawal.user_id,
              is_read: false,
              category: 'withdrawal'
            },
            attributes: ['id', 'data']
          });
          const hasUnreadNoStock = existingList.some(n => n.data?.subtype === 'withdrawal_item_not_in_stock' && n.data?.withdrawal_id === withdrawal.id);
          if (!hasUnreadNoStock) {
            await Notification.create({
              user_id: withdrawal.user_id,
              type: 'warning',
              title: 'Предмет временно отсутствует у бота',
              message: `Предмет «${itemName}» не найден в инвентаре бота. Вы можете получить ChiCoins на сумму ${itemPrice} или подождать — мы повторим попытку вывода позже.`,
              category: 'withdrawal',
              importance: 7,
              data: {
                subtype: 'withdrawal_item_not_in_stock',
                withdrawal_id: withdrawal.id,
                item_name: itemName,
                item_value: itemPrice,
                item_id: item.id
              }
            });
            logger.info(`📧 Уведомление с выбором создано для пользователя ${withdrawal.user_id}, withdrawal ${withdrawal.id}`);
          } else {
            logger.info(`📧 Пропуск дубликата уведомления для withdrawal ${withdrawal.id}`);
          }
        }
        return;
      }

    } catch (error) {
      logger.error(`❌ Ошибка обработки withdrawal ${withdrawal.id}:`, error);

      // Возвращаем предмет в инвентарь и обновляем статус в одной транзакции
      await this.failWithdrawalAndReturnItems(
        withdrawal,
        `Ошибка обработки: ${error.message}`,
        (withdrawal.processing_attempts || 0) + 1
      );
    }
  }

  /**
   * Попытка обработать через Steam бота
   */
  async tryProcessViaSteam(withdrawal, item) {
    try {
      // Получаем инвентарь бота
      const botInventory = await this.steamBot.getInventory();

      if (!botInventory || botInventory.length === 0) {
        logger.info('⚠️ Инвентарь Steam бота пуст');
        return false;
      }

      logger.info(`📦 В инвентаре Steam бота ${botInventory.length} предметов`);

      // Ищем нужный предмет по market_hash_name
      const marketHashName = item.steam_market_hash_name || item.name;
      const foundItem = botInventory.find(invItem => {
        const itemName = invItem.market_hash_name || invItem.name || '';
        return itemName.toLowerCase() === marketHashName.toLowerCase();
      });

      if (!foundItem) {
        logger.info(`⚠️ Предмет "${marketHashName}" не найден в инвентаре бота`);
        return false;
      }

      logger.info(`✅ Предмет найден в Steam боте! AssetID: ${foundItem.assetid}`);

      // Получаем Trade URL
      const tradeUrl = withdrawal.steam_trade_url || withdrawal.user.steam_trade_url;

      if (!tradeUrl) {
        throw new Error('Trade URL отсутствует');
      }

      // Отправляем трейд
      logger.info('📤 Отправка Steam трейда...');
      logger.info(`📝 Trade URL: ${tradeUrl}`);

      // Валидируем Trade URL и извлекаем Steam ID и токен
      const urlValidation = await this.steamBot.validateTradeUrl(tradeUrl);
      if (!urlValidation.valid) {
        throw new Error(urlValidation.error || 'Неверный Trade URL');
      }

      logger.info('Trade URL валиден', { partnerId: urlValidation.partnerId });

      const tradeResult = await this.steamBot.sendTradeOfferWithToken(
        urlValidation.partnerSteamId,
        urlValidation.token,
        [foundItem],
        [] // Пустой массив - мы не получаем предметы от пользователя
      );

      if (tradeResult.success) {
        logger.info(`✅ Трейд отправлен! Offer ID: ${tradeResult.tradeOfferId}`);

        // Обновляем withdrawal
        await withdrawal.update({
          status: 'direct_trade_sent',
          steam_trade_offer_id: tradeResult.tradeOfferId,
          steam_trade_status: 'sent',
          purchase_method: 'steam_bot',
          completion_date: new Date(),
          admin_notes: `Трейд отправлен через Steam бота. Offer ID: ${tradeResult.tradeOfferId}`
        });

        return true;
      } else {
        // Предмет найден, но трейд не отправлен - это критическая ошибка
        const errorMsg = tradeResult.message || tradeResult.error || 'Неизвестная ошибка отправки трейда';
        logger.error(`❌ Ошибка отправки трейда: ${errorMsg}`);
        throw new Error(`Не удалось отправить трейд: ${errorMsg}`);
      }

    } catch (error) {
      // Если предмет не найден в инвентаре - возвращаем false для поиска на PlayerOk
      if (error.message && error.message.includes('не найден в инвентаре')) {
        logger.info('⚠️ Предмет не найден в инвентаре Steam бота');
        return false;
      }

      // Любая другая ошибка - критическая (Trade URL, отправка трейда и т.д.)
      logger.error('❌ Критическая ошибка при обработке через Steam:', error.message);
      throw error;
    }
  }

  /**
   * Попытка обработать через PlayerOk
   */
  async tryProcessViaPlayerOk(withdrawal, item) {
    try {
      // Получаем актуальную цену Steam
      const steamPrice = await this.getSteamPrice(item);
      logger.info(`💵 Актуальная цена Steam: ${steamPrice}₽`);

      // Ищем на PlayerOk
      const bestOffer = await this.playerokBot.searchItem(
        item.name,
        Math.max(steamPrice, item.price) // Не дороже максимума из Steam/ChiBox
      );

      if (!bestOffer) {
        logger.info('⚠️ Предмет не найден на PlayerOk');
        return false;
      }

      logger.info(`🏆 Найден на PlayerOk: ${bestOffer.price}₽`);

      // Сравниваем цены
      const comparison = this.playerokBot.comparePrices(
        bestOffer.price,
        steamPrice,
        item.price
      );

      logger.info(`📊 Анализ цен:`);
      logger.info(`   PlayerOk (с комиссией): ${comparison.total_cost.toFixed(2)}₽`);
      logger.info(`   Steam Market: ${steamPrice}₽`);
      logger.info(`   ChiBox Price: ${item.price}₽`);
      logger.info(`   Решение: ${comparison.decision}`);
      logger.info(`   Причина: ${comparison.reason}`);

      // Проверяем выгодность
      if (comparison.decision !== 'buy') {
        logger.warn(`❌ Невыгодно покупать: ${comparison.reason}`);
        return false;
      }

      logger.info(`✅ ПОКУПАЕМ! Прибыль: ${comparison.profit_vs_chibox.toFixed(2)}₽`);

      // Покупаем на PlayerOk
      const tradeUrl = withdrawal.steam_trade_url || withdrawal.user.steam_trade_url;

      const purchaseResult = await this.playerokBot.purchaseItem(
        bestOffer.url,
        tradeUrl
      );

      if (purchaseResult.success) {
        logger.info(`✅ Покупка успешна! Chat ID: ${purchaseResult.chat_id}`);

        // Обновляем withdrawal
        await withdrawal.update({
          status: 'purchased_on_playerok',
          playerok_order_id: purchaseResult.chat_id,
          playerok_price: bestOffer.price,
          playerok_fee: comparison.playerok_fee,
          playerok_total_cost: comparison.total_cost,
          steam_market_price: steamPrice,
          chibox_item_price: item.price,
          arbitrage_profit: comparison.profit_vs_chibox,
          arbitrage_margin_percent: comparison.margin_percent,
          playerok_item_url: bestOffer.url,
          purchase_method: 'playerok_arbitrage',
          admin_notes: `PlayerOk покупка: Chat ${purchaseResult.chat_id}. Цена: ${bestOffer.price}₽. Прибыль: ${comparison.profit_vs_chibox.toFixed(2)}₽ (${comparison.margin_percent}%)`
        });

        return true;
      } else {
        logger.error(`❌ Ошибка покупки на PlayerOk: ${purchaseResult.error}`);
        return false;
      }

    } catch (error) {
      logger.error('❌ Ошибка обработки через PlayerOk:', error);
      return false;
    }
  }

  /**
   * Получение актуальной цены Steam
   */
  async getSteamPrice(item) {
    try {
      if (!item.steam_market_hash_name) {
        logger.warn(`⚠️ Нет steam_market_hash_name для ${item.name}`);
        return item.price;
      }

      const priceData = await steamPriceService.getItemPrice(item.steam_market_hash_name);

      if (priceData && priceData.success && priceData.price_rub > 0) {
        return priceData.price_rub;
      }

      return item.price;
    } catch (error) {
      logger.error(`❌ Ошибка получения цены Steam:`, error);
      return item.price;
    }
  }

  /**
   * Конвертация цены в рубли
   */
  convertToRubles(priceString) {
    try {
      const numericValue = parseFloat(priceString.replace(/[^\d.,]/g, '').replace(',', '.'));

      // Если цена в долларах, конвертируем
      if (priceString.includes('$')) {
        return numericValue * 90; // Примерный курс
      }

      return numericValue;
    } catch (error) {
      logger.error('❌ Ошибка конвертации цены:', error);
      return 0;
    }
  }

  /**
   * Возврат предметов в инвентарь при неудачном выводе
   */
  /**
   * Возвращает предметы в инвентарь В РАМКАХ ТРАНЗАКЦИИ
   */
  async returnItemsToInventory(withdrawal, transaction) {
    try {
      if (!withdrawal.items || withdrawal.items.length === 0) {
        logger.warn(`⚠️ Нет предметов для возврата в withdrawal ${withdrawal.id}`);
        return;
      }

      logger.info(`🔄 Возврат ${withdrawal.items.length} предмет(ов) в инвентарь для withdrawal ${withdrawal.id}`);

      for (const item of withdrawal.items) {
        await item.update({
          status: 'inventory',
          withdrawal_id: null,
          transaction_date: new Date()
        }, { transaction });

        logger.info(`✅ Предмет ${item.id} (${item.item?.name || 'Unknown'}) возвращен в инвентарь`);
      }

      logger.info(`✅ Предметы для withdrawal ${withdrawal.id} успешно возвращены в инвентарь`);
    } catch (error) {
      logger.error(`❌ Ошибка возврата предметов в инвентарь для withdrawal ${withdrawal.id}:`, error);
      throw error; // Пробрасываем ошибку для отката транзакции
    }
  }

  /**
   * Переводит withdrawal в статус failed и возвращает предметы в инвентарь АТОМАРНО
   */
  async failWithdrawalAndReturnItems(withdrawal, failedReason, processingAttempts = null) {
    const transaction = await withdrawal.sequelize.transaction({
      isolationLevel: Withdrawal.sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
    });

    try {
      logger.info(`🔄 [FAIL WITHDRAWAL] Начало атомарной операции для withdrawal ${withdrawal.id}`);

      // Получаем withdrawal с блокировкой
      const lockedWithdrawal = await Withdrawal.findOne({
        where: { id: withdrawal.id },
        include: [{
          model: UserInventory,
          as: 'items',
          include: [{ model: Item, as: 'item' }]
        }],
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!lockedWithdrawal) {
        throw new Error(`Withdrawal ${withdrawal.id} не найден`);
      }

      // Возвращаем предметы в инвентарь (в рамках транзакции)
      await this.returnItemsToInventory(lockedWithdrawal, transaction);

      // Обновляем статус withdrawal
      const updateData = {
        status: 'failed',
        failed_reason: failedReason
      };

      if (processingAttempts !== null) {
        updateData.processing_attempts = processingAttempts;
      }

      await lockedWithdrawal.update(updateData, { transaction });

      logger.info(`✅ [FAIL WITHDRAWAL] Withdrawal ${withdrawal.id} переведен в статус failed`);

      // Коммитим транзакцию
      await transaction.commit();
      logger.info(`✅ [FAIL WITHDRAWAL] Транзакция успешно завершена для withdrawal ${withdrawal.id}`);

      // Создаем уведомление ДЛЯ ПОЛЬЗОВАТЕЛЯ ПОСЛЕ коммита
      try {
        await Withdrawal.sequelize.models.Notification.create({
          user_id: lockedWithdrawal.user_id,
          type: 'error',
          title: 'Вывод не удался',
          message: `Ваш запрос на вывод предмета не был выполнен. Предмет возвращен в инвентарь. Причина: ${failedReason}`,
          related_id: lockedWithdrawal.id,
          category: 'withdrawal',
          importance: 5
        });
        logger.info(`📧 [FAIL WITHDRAWAL] Уведомление создано для пользователя ${lockedWithdrawal.user_id}`);
      } catch (notificationError) {
        logger.error(`❌ [FAIL WITHDRAWAL] Ошибка создания уведомления:`, notificationError);
        // Не критично, продолжаем работу
      }

    } catch (error) {
      logger.error(`❌ [FAIL WITHDRAWAL] Ошибка атомарной операции для withdrawal ${withdrawal.id}:`, error);

      // Откатываем транзакцию
      try {
        await transaction.rollback();
        logger.info(`🔄 [FAIL WITHDRAWAL] Транзакция откатана для withdrawal ${withdrawal.id}`);
      } catch (rollbackError) {
        logger.error(`❌ [FAIL WITHDRAWAL] Ошибка отката транзакции:`, rollbackError);
      }

      throw error;
    }
  }

  /**
   * Остановка процессора
   */
  async stop() {
    logger.info('🛑 Остановка процессора...');
    this.isRunning = false;

    if (this.steamBot) {
      // Steam bot logout если есть метод
      logger.info('🔒 Закрытие Steam бота');
    }

    if (this.playerokBot) {
      await this.playerokBot.close();
    }

    logger.info('✅ Процессор остановлен');
  }

  /**
   * Утилита для задержки
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Создаем экземпляр процессора
const processor = new WithdrawalProcessor();

// Обработка сигналов завершения
process.on('SIGINT', async () => {
  logger.info('\n🛑 Получен сигнал SIGINT');
  await processor.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('\n🛑 Получен сигнал SIGTERM');
  await processor.stop();
  process.exit(0);
});

// Запускаем
processor.start().catch(async (error) => {
  logger.error('❌ Фатальная ошибка:', error);
  await processor.stop();
  process.exit(1);
});
