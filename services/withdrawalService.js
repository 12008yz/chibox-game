const db = require('../models');
const winston = require('winston');
const { Op } = require('sequelize');
const LisService = require('./lisService');
const SteamBot = require('./steamBotService');
const config = require('../config/config');
const steamBotConfig = require('../config/steam_bot');

// Создаем логгер
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'withdrawal-service.log' })
  ],
});

// Загружаем конфигурацию LIS-Skins
const lisConfig = LisService.loadConfig();
const lisService = new LisService(lisConfig);

// Создаем экземпляр Steam бота из конфигурационного файла
const steamBot = new SteamBot(
  steamBotConfig.accountName,
  steamBotConfig.password,
  steamBotConfig.sharedSecret,
  steamBotConfig.identitySecret
);

class WithdrawalService {
  constructor() {
    // Максимальное количество попыток обработки заявки
    this.maxProcessingAttempts = 3;

    // Задержка между попытками в миллисекундах (1 час)
    this.retryDelay = 60 * 60 * 1000;

    // Максимальное количество одновременно обрабатываемых заявок
    this.maxConcurrentProcessing = 5;
  }

  // Получение списка заявок, ожидающих обработку
  async getPendingWithdrawals() {
    try {
      const pendingWithdrawals = await db.Withdrawal.findAll({
        where: {
          status: {
            [Op.in]: ['pending', 'queued']
          },
          processing_attempts: {
            [Op.lt]: this.maxProcessingAttempts
          },
          is_automatic: true,
          next_attempt_date: {
            [Op.or]: [
              { [Op.lte]: new Date() },
              { [Op.is]: null }
            ]
          }
        },
        order: [
          ['priority', 'DESC'],
          ['request_date', 'ASC']
        ],
        limit: this.maxConcurrentProcessing,
        include: [
          {
            model: db.User,
            as: 'user',
            attributes: ['id', 'username', 'steam_trade_url']
          },
          {
            model: db.UserInventory,
            as: 'items',
            include: [
              {
                model: db.Item,
                as: 'item'
              }
            ]
          }
        ]
      });

      logger.info(`Найдено ${pendingWithdrawals.length} заявок на вывод, ожидающих обработки`);
      return pendingWithdrawals;
    } catch (error) {
      logger.error('Ошибка при получении списка заявок на вывод:', error);
      throw error;
    }
  }

  // Обработка заявки на вывод
  async processWithdrawal(withdrawal) {
    logger.info(`Начало обработки заявки на вывод #${withdrawal.id}...`);

    try {
      // Проверяем, что заявка содержит предметы
      if (!withdrawal.items || withdrawal.items.length === 0) {
        logger.error(`Заявка #${withdrawal.id} не содержит предметов для вывода`);
        await this.failWithdrawal(withdrawal, 'Заявка не содержит предметов для вывода');
        return false;
      }

      // Получаем информацию о торговой ссылке пользователя
      const userTradeUrl = withdrawal.steam_trade_url || withdrawal.user.steam_trade_url;
      if (!userTradeUrl) {
        logger.error(`Пользователь #${withdrawal.user_id} не указал торговую ссылку Steam`);
        await this.failWithdrawal(withdrawal, 'Не указана торговая ссылка Steam');
        return false;
      }

      // Получаем предметы для вывода
      const userInventoryItem = withdrawal.items[0]; // Берем первый предмет из заявки
      const item = userInventoryItem.item; // Получаем данные о самом предмете

      // Проверяем наличие предмета в инвентаре бота
      const botInventory = await steamBot.getInventory(730, 2); // 730 - ID игры CS:GO, 2 - контекст инвентаря
      const botItem = botInventory.find(invItem =>
        invItem.market_hash_name === item.steam_market_hash_name
      );

      // Если предмет есть у бота - отправляем его сразу
      if (botItem) {
        logger.info(`Предмет ${item.steam_market_hash_name} найден в инвентаре бота, отправляем...`);
        return await this.sendItemFromBot(withdrawal, botItem, userTradeUrl);
      }

      // Если предмета нет - покупаем его на LIS-Skins
      logger.info(`Предмет ${item.steam_market_hash_name} не найден в инвентаре бота, покупаем на LIS-Skins...`);
      return await this.buyItemFromLisAndSend(withdrawal, item, userTradeUrl);

    } catch (error) {
      logger.error(`Ошибка при обработке заявки #${withdrawal.id}:`, error);

      // Увеличиваем счетчик попыток и обновляем дату следующей попытки
      const newAttempts = (withdrawal.processing_attempts || 0) + 1;
      const nextAttemptDate = new Date(Date.now() + this.retryDelay);

      await withdrawal.update({
        processing_attempts: newAttempts,
        next_attempt_date: nextAttemptDate,
        error_message: error.message || 'Неизвестная ошибка при обработке заявки'
      });

      // Если достигнуто максимальное количество попыток - отмечаем заявку как неудачную
      if (newAttempts >= this.maxProcessingAttempts) {
        await this.failWithdrawal(withdrawal, 'Превышено максимальное количество попыток обработки');
      }

      return false;
    }
  }

  // Отправка предмета из инвентаря бота
  async sendItemFromBot(withdrawal, botItem, tradeUrl) {
    try {
      logger.info(`Отправка предмета ${botItem.market_hash_name} пользователю #${withdrawal.user_id}...`);

      // Инициализируем Steam бота, если необходимо
      await steamBot.initialize();

      const userInventoryItem = withdrawal.items[0];

      // Отправляем предложение обмена
      const tradeResult = await steamBot.sendTradeOffer(
        tradeUrl,
        [botItem],
        [], // Пустой массив для предметов, которые мы хотим получить от пользователя
        `Вывод предмета #${withdrawal.id}`
      );

      if (!tradeResult.success) {
        logger.error(`Ошибка при отправке предложения обмена: ${tradeResult.error}`);
        await this.failWithdrawal(withdrawal, `Ошибка при отправке предложения обмена: ${tradeResult.error}`);
        return false;
      }

      logger.info(`Предложение обмена #${tradeResult.offerId} успешно отправлено`);

      // Обновляем статус заявки в БД
      await withdrawal.update({
        status: 'sent',
        steam_trade_offer_id: tradeResult.offerId,
        tracking_data: {
          ...withdrawal.tracking_data,
          trade_offer_sent: true,
          trade_offer_id: tradeResult.offerId,
          trade_offer_time: new Date().toISOString()
        }
      });

      // Обновляем статус предмета в инвентаре пользователя
      await userInventoryItem.update({
        status: 'withdrawn',
        transaction_date: new Date()
      });

      // Создаем запись в логе транзакций
      await db.Transaction.create({
        user_id: withdrawal.user_id,
        type: 'item_withdrawal',
        amount: 0, // Нет финансовой транзакции
        details: {
          withdrawal_id: withdrawal.id,
          item_id: userInventoryItem.item_id,
          item_name: botItem.market_hash_name,
          trade_offer_id: tradeResult.offerId
        }
      });

      return true;
    } catch (error) {
      logger.error(`Ошибка при отправке предмета из инвентаря бота (заявка #${withdrawal.id}):`, error);
      throw error;
    }
  }

  // Покупка предмета на LIS-Skins и отправка пользователю с улучшенной обработкой ошибок
  async buyItemFromLisAndSend(withdrawal, item, tradeUrl) {
    try {
      // Проверка баланса на LIS-Skins перед покупкой
      await lisService.initialize();
      if (!lisService.isLoggedIn) {
        logger.error('Не удалось авторизоваться на LIS-Skins. Проверьте конфигурацию cookies.');
        await this.failWithdrawal(withdrawal, 'Не удалось авторизоваться на LIS-Skins. Проверьте конфигурацию сервиса.');
        return false;
      }

      // Проверяем баланс
      const balanceResult = await lisService.getBalance();
      if (!balanceResult.success) {
        logger.error(`Не удалось получить баланс LIS-Skins: ${balanceResult.message}`);
        // Не отменяем заявку сразу, попробуем все равно найти и купить предмет
      } else {
        logger.info(`Текущий баланс на LIS-Skins: ${balanceResult.balance}`);
      }

      // Ищем предмет на LIS-Skins
      logger.info(`Поиск предмета ${item.steam_market_hash_name} (${item.exterior || 'любой износ'}) на LIS-Skins...`);
      const lisItem = await lisService.searchItem(item.steam_market_hash_name, item.exterior);

      if (!lisItem) {
        logger.error(`Предмет ${item.steam_market_hash_name} не найден на LIS-Skins`);

        // Обновляем данные о заявке с информацией о поиске
        await withdrawal.update({
          tracking_data: {
            ...withdrawal.tracking_data,
            lis_search_attempted: true,
            lis_search_failed: true,
            search_time: new Date().toISOString()
          }
        });

        // Проверяем, может быть предмет без указания степени износа
        if (item.exterior) {
          logger.info(`Попытка найти предмет ${item.steam_market_hash_name} без указания степени износа...`);
          const genericItem = await lisService.searchItem(item.steam_market_hash_name, null);

          if (genericItem) {
            logger.info(`Найден общий предмет: ${genericItem.market_hash_name}`);

            // Фильтруем предложения по нужному exterior, если они есть
            if (genericItem.items && genericItem.items.length > 0) {
              const matchingOffers = genericItem.items.filter(offer =>
                offer.name && offer.name.includes(item.exterior)
              );

              if (matchingOffers.length > 0) {
                logger.info(`Найдено ${matchingOffers.length} предложений с нужным exterior`);

                // Создаем новый объект предмета с правильными предложениями
                genericItem.items = matchingOffers;
                return await this.processPurchase(withdrawal, item, genericItem, tradeUrl);
              }
            }
          }
        }

        await this.failWithdrawal(withdrawal, 'Предмет не найден на LIS-Skins');
        return false;
      }

      return await this.processPurchase(withdrawal, item, lisItem, tradeUrl);

    } catch (error) {
      logger.error(`Ошибка при покупке предмета на LIS-Skins (заявка #${withdrawal.id}):`, error);

      // Дополнительная информация для диагностики
      const errorInfo = {
        message: error.message,
        stack: error.stack,
        time: new Date().toISOString()
      };

      // Обновляем заявку с информацией об ошибке
      await withdrawal.update({
        tracking_data: {
          ...withdrawal.tracking_data,
          lis_purchase_error: errorInfo
        }
      });

      throw error;
    }
  }

  // Отдельный метод для обработки покупки после нахождения предмета
  async processPurchase(withdrawal, item, lisItem, tradeUrl) {
    // Проверяем наличие доступных предложений
    if (!lisItem.items || lisItem.items.length === 0) {
      logger.error(`Нет доступных предложений для ${item.steam_market_hash_name} на LIS-Skins`);
      await this.failWithdrawal(withdrawal, 'Нет доступных предложений на LIS-Skins');
      return false;
    }

    // Сортируем предложения по цене (от низкой к высокой)
    const sortedOffers = lisItem.items.sort((a, b) => a.price - b.price);
    const cheapestOffer = sortedOffers[0];

    logger.info(`Найдено ${sortedOffers.length} предложений на LIS-Skins`);
    logger.info(`Выбрано самое дешевое предложение: ${lisItem.market_hash_name}, Цена: ${cheapestOffer.price}, ID: ${cheapestOffer.id}`);

    // Получаем баланс перед покупкой
    const balanceResult = await lisService.getBalance();
    if (balanceResult.success && balanceResult.balance < cheapestOffer.price) {
      logger.error(`Недостаточно средств для покупки предмета. Баланс: ${balanceResult.balance}, Цена: ${cheapestOffer.price}`);
      await this.failWithdrawal(withdrawal, `Недостаточно средств на LIS-Skins. Баланс: ${balanceResult.balance}, Цена: ${cheapestOffer.price}`);
      return false;
    }

    // Покупаем предмет
    logger.info(`Покупка предмета ${lisItem.market_hash_name} (ID: ${lisItem.goods_id}, Asset ID: ${cheapestOffer.id})...`);
    const purchaseResult = await lisService.buyItem(lisItem.goods_id, cheapestOffer.id, cheapestOffer.price);

    if (!purchaseResult.success) {
      // Обработка специфичных ошибок
      if (purchaseResult.error_type === 'insufficient_balance') {
        logger.error(`Недостаточно средств для покупки: ${purchaseResult.message}`);
        await this.failWithdrawal(withdrawal, `Недостаточно средств на LIS-Skins: ${purchaseResult.message}`);
        return false;
      }

      if (purchaseResult.error_type === 'item_unavailable') {
        logger.warn(`Предмет недоступен: ${purchaseResult.message}`);

        // Проверяем, есть ли другие предложения
        if (sortedOffers.length > 1) {
          logger.info(`Попытка купить следующее предложение (всего доступно: ${sortedOffers.length - 1})...`);

          // Обновляем tracking_data с информацией о неудачной попытке
          await withdrawal.update({
            tracking_data: {
              ...withdrawal.tracking_data,
              failed_purchase_attempts: (withdrawal.tracking_data?.failed_purchase_attempts || 0) + 1,
              last_failed_offer: cheapestOffer.id
            }
          });

          // Покупаем следующее предложение
          const nextOffer = sortedOffers[1];
          const nextPurchaseResult = await lisService.buyItem(lisItem.goods_id, nextOffer.id, nextOffer.price);

          if (nextPurchaseResult.success) {
            logger.info(`Предмет успешно куплен (второе предложение) на LIS-Skins. Order ID: ${nextPurchaseResult.bill_no}`);

            // Обновляем данные о заявке
            await withdrawal.update({
              tracking_data: {
                ...withdrawal.tracking_data,
                lis_purchase: true,
                lis_order_id: nextPurchaseResult.bill_no,
                purchase_time: new Date().toISOString(),
                purchase_price: nextOffer.price,
                used_alternate_offer: true
              }
            });

            // Планируем проверку доставки
            return await this.scheduleDeliveryCheck(withdrawal);
          }
        }

        await this.failWithdrawal(withdrawal, `Предмет недоступен на LIS-Skins: ${purchaseResult.message}`);
        return false;
      }

      logger.error(`Ошибка покупки предмета на LIS-Skins: ${purchaseResult.message}`);
      await this.failWithdrawal(withdrawal, `Ошибка покупки на LIS-Skins: ${purchaseResult.message}`);
      return false;
    }

    logger.info(`Предмет успешно куплен на LIS-Skins. Order ID: ${purchaseResult.bill_no}`);

    // Обновляем данные о заявке
    await withdrawal.update({
      tracking_data: {
        ...withdrawal.tracking_data,
        lis_purchase: true,
        lis_order_id: purchaseResult.bill_no,
        purchase_time: new Date().toISOString(),
        purchase_price: cheapestOffer.price
      }
    });

    return await this.scheduleDeliveryCheck(withdrawal);
  }

  // Планирование проверки доставки
  async scheduleDeliveryCheck(withdrawal) {
    // Планируем проверку доставки через 2 минуты (снижаем время ожидания с 5 минут)
    const nextCheckTime = new Date(Date.now() + 2 * 60 * 1000);
    await withdrawal.update({
      status: 'processing', // Оставляем в статусе обработки
      next_attempt_date: nextCheckTime,
      tracking_data: {
        ...withdrawal.tracking_data,
        delivery_check_scheduled: true,
        next_check_time: nextCheckTime.toISOString()
      }
    });

    return true;
  }

  // Проверка статуса доставки предмета с LIS-Skins
  async checkItemDeliveryStatus(withdrawal) {
    try {
      if (!withdrawal.tracking_data || !withdrawal.tracking_data.lis_order_id) {
        logger.error(`Нет данных о покупке на LIS-Skins для заявки #${withdrawal.id}`);
        return false;
      }

      const orderId = withdrawal.tracking_data.lis_order_id;

      // Инициализируем LIS-Skins сервис
      await lisService.initialize();

      // Проверяем статус доставки
      const deliveryStatus = await lisService.checkItemDeliveryStatus(orderId);

      if (!deliveryStatus.success) {
        logger.error(`Ошибка при проверке статуса доставки для Order ID ${orderId}`);
        return false;
      }

      logger.info(`Статус доставки для Order ID ${orderId}: ${deliveryStatus.status}`);

      // Если предмет уже доставлен в Steam
      if (deliveryStatus.status === 'completed' || deliveryStatus.status === 'delivered') {
        // Обновляем данные заявки
        await withdrawal.update({
          tracking_data: {
            ...withdrawal.tracking_data,
            delivery_status: deliveryStatus.status,
            delivery_completed: true,
            delivery_time: new Date().toISOString()
          }
        });

        // Получаем обновленный инвентарь бота
        const inventory = await steamBot.getInventory(730, 2, true);

        // Ищем предмет по инвентарю
        const userInventoryItem = withdrawal.items[0];
        const item = userInventoryItem.item;

        // Пытаемся найти предмет в инвентаре
        const botItem = inventory.find(invItem =>
          invItem.market_hash_name === item.steam_market_hash_name
        );

        if (botItem) {
          logger.info(`Предмет ${item.steam_market_hash_name} найден в инвентаре бота, отправляем пользователю...`);

          // Получаем trade_url из заявки или из профиля пользователя
          const tradeUrl = withdrawal.steam_trade_url || withdrawal.user.steam_trade_url;

          // Отправляем предмет пользователю
          return await this.sendItemFromBot(withdrawal, botItem, tradeUrl);
        } else {
          logger.warn(`Предмет ${item.steam_market_hash_name} не найден в инвентаре бота после доставки с LIS-Skins`);

          // Планируем еще одну проверку через 5 минут
          const nextCheckTime = new Date(Date.now() + 5 * 60 * 1000);
          await withdrawal.update({
            next_attempt_date: nextCheckTime,
            tracking_data: {
              ...withdrawal.tracking_data,
              inventory_check_failed: true,
              next_check_time: nextCheckTime.toISOString()
            }
          });

          return false;
        }
      } else if (deliveryStatus.status === 'failed' || deliveryStatus.status === 'canceled') {
        // Если доставка не удалась
        logger.error(`Доставка не удалась для Order ID ${orderId}: ${deliveryStatus.status}`);
        await this.failWithdrawal(withdrawal, `Ошибка доставки с LIS-Skins: ${deliveryStatus.status}`);
        return false;
      } else {
        // Если предмет еще в процессе доставки
        logger.info(`Предмет всё еще в процессе доставки для Order ID ${orderId}: ${deliveryStatus.status}`);

        // Планируем следующую проверку через 5 минут
        const nextCheckTime = new Date(Date.now() + 5 * 60 * 1000);
        await withdrawal.update({
          next_attempt_date: nextCheckTime,
          tracking_data: {
            ...withdrawal.tracking_data,
            delivery_status: deliveryStatus.status,
            next_check_time: nextCheckTime.toISOString()
          }
        });

        return false;
      }
    } catch (error) {
      logger.error(`Ошибка при проверке статуса доставки предмета (заявка #${withdrawal.id}):`, error);
      throw error;
    }
  }

  // Проверка статуса отправленного трейда
  async checkTradeOfferStatus(withdrawal) {
    try {
      if (!withdrawal.steam_trade_offer_id) {
        logger.error(`Нет данных о трейде для заявки #${withdrawal.id}`);
        return false;
      }

      // Инициализируем Steam бота
      await steamBot.initialize();

      // Получаем статус трейда
      const tradeStatus = await steamBot.checkTradeOffer(withdrawal.steam_trade_offer_id);

      logger.info(`Статус трейда #${withdrawal.steam_trade_offer_id}: ${tradeStatus.status}`);

      // Если трейд успешно завершен
      if (tradeStatus.status === 'accepted') {
        // Обновляем статус заявки
        await withdrawal.update({
          status: 'completed',
          completion_date: new Date(),
          tracking_data: {
            ...withdrawal.tracking_data,
            trade_offer_status: tradeStatus.status,
            trade_completed: true,
            trade_completion_time: new Date().toISOString()
          }
        });

        logger.info(`Заявка #${withdrawal.id} успешно завершена`);
        return true;
      }
      // Если трейд отклонен или отменен
      else if (tradeStatus.status === 'declined' || tradeStatus.status === 'canceled' || tradeStatus.status === 'invalid') {
        // Отмечаем заявку как неудачную
        await this.failWithdrawal(withdrawal, `Трейд не удался: ${tradeStatus.status}`);
        return false;
      }
      // Если трейд всё еще в процессе
      else {
        // Планируем следующую проверку через 15 минут
        const nextCheckTime = new Date(Date.now() + 15 * 60 * 1000);
        await withdrawal.update({
          next_attempt_date: nextCheckTime,
          tracking_data: {
            ...withdrawal.tracking_data,
            trade_offer_status: tradeStatus.status,
            next_check_time: nextCheckTime.toISOString()
          }
        });

        return false;
      }
    } catch (error) {
      logger.error(`Ошибка при проверке статуса трейда (заявка #${withdrawal.id}):`, error);
      throw error;
    }
  }

  // Обработка неудачной заявки
  async failWithdrawal(withdrawal, reason) {
    try {
      logger.warn(`Заявка #${withdrawal.id} помечена как неудачная: ${reason}`);

      // Обновляем заявку в БД
      await withdrawal.update({
        status: 'failed',
        completion_date: new Date(),
        error_message: reason,
        tracking_data: {
          ...withdrawal.tracking_data,
          failure_reason: reason,
          failure_time: new Date().toISOString()
        }
      });

      // Возвращаем предметы в инвентарь пользователя
      for (const userInventoryItem of withdrawal.items) {
        await userInventoryItem.update({
          status: 'in_inventory' // Возвращаем статус "в инвентаре"
        });
      }

      // Создаем запись в логе транзакций о неудачной попытке вывода
      await db.Transaction.create({
        user_id: withdrawal.user_id,
        type: 'withdrawal_failed',
        amount: 0,
        details: {
          withdrawal_id: withdrawal.id,
          reason: reason
        }
      });

      return true;
    } catch (error) {
      logger.error(`Ошибка при обработке неудачной заявки #${withdrawal.id}:`, error);
      throw error;
    }
  }

  // Обработка всех ожидающих заявок
  async processAllPendingWithdrawals() {
    try {
      logger.info('Начало обработки всех ожидающих заявок...');

      // Получаем список заявок
      const pendingWithdrawals = await this.getPendingWithdrawals();

      if (pendingWithdrawals.length === 0) {
        logger.info('Нет ожидающих заявок для обработки');
        return true;
      }

      // Счетчики для статистики
      let successCount = 0;
      let failCount = 0;

      // Обрабатываем каждую заявку последовательно
      for (const withdrawal of pendingWithdrawals) {
        try {
          // Отмечаем заявку как "в обработке"
          await withdrawal.update({
            status: 'processing',
            processing_start: new Date()
          });

          // Проверяем, есть ли данные о трейде
          if (withdrawal.steam_trade_offer_id) {
            // Если трейд уже был отправлен, проверяем его статус
            const tradeCheckResult = await this.checkTradeOfferStatus(withdrawal);
            if (tradeCheckResult) {
              successCount++;
            } else {
              failCount++;
            }
          }
          // Проверяем, была ли совершена покупка на LIS-Skins
          else if (withdrawal.tracking_data && withdrawal.tracking_data.lis_order_id) {
            // Если покупка была совершена, проверяем статус доставки
            await this.checkItemDeliveryStatus(withdrawal);
          }
          // Иначе - это новая заявка, обрабатываем её полностью
          else {
            const result = await this.processWithdrawal(withdrawal);
            if (result) {
              successCount++;
            } else {
              failCount++;
            }
          }
        } catch (error) {
          logger.error(`Ошибка при обработке заявки #${withdrawal.id}:`, error);
          failCount++;

          // Увеличиваем счетчик попыток и откладываем следующую попытку
          const newAttempts = (withdrawal.processing_attempts || 0) + 1;
          const nextAttemptDate = new Date(Date.now() + this.retryDelay);

          await withdrawal.update({
            status: 'pending', // Возвращаем статус "ожидание"
            processing_attempts: newAttempts,
            next_attempt_date: nextAttemptDate,
            error_message: error.message || 'Неизвестная ошибка'
          });
        }
      }

      logger.info(`Обработка заявок завершена. Успешно: ${successCount}, Неудачно: ${failCount}`);
      return true;
    } catch (error) {
      logger.error('Общая ошибка при обработке заявок:', error);
      throw error;
    } finally {
      // Закрываем соединения сервисов
      if (lisService.page) {
        await lisService.close();
      }
      await steamBot.shutdown();
    }
  }
}

module.exports = new WithdrawalService();
