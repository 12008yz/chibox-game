const { Withdrawal, Item, User, UserInventory, sequelize } = require('../models');
const winston = require('winston');
const SteamBotService = require('./steamBotService');
const steamBotConfig = {
  accountName: process.env.STEAM_ACCOUNT_NAME || '',
  password: process.env.STEAM_PASSWORD || '',
  sharedSecret: process.env.STEAM_SHARED_SECRET || '',
  identitySecret: process.env.STEAM_IDENTITY_SECRET || ''
};
const CSMoneyService = require('./csmoneyService');
const csmoneyService = new CSMoneyService(CSMoneyService.loadConfig());
const { Op } = require('sequelize');
const moment = require('moment');

// Инициализируем SteamBot
const steamBotService = new SteamBotService(steamBotConfig);

// Логгер
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

// Функция для форматирования даты и времени
function formatDate(date) {
  return moment(date).format('YYYY-MM-DD HH:mm:ss');
}

class WithdrawalService {
  // Метод для обработки заявки на вывод
  async processWithdrawal(withdrawal) {
    // Проверяем, что заявка в статусе pending
    if (withdrawal.status !== 'pending') {
      logger.info(`Заявка #${withdrawal.id} уже обрабатывается или завершена. Текущий статус: ${withdrawal.status}`);
      return;
    }

    // Обновляем статус заявки
    await withdrawal.update({
      status: 'processing',
      processing_start_date: new Date(),
      tracking_data: {
        ...withdrawal.tracking_data,
        process_started: true,
        start_time: new Date().toISOString()
      }
    });

    try {
      // Загружаем полные данные заявки с пользователем и предметами
      const fullWithdrawal = await Withdrawal.findByPk(withdrawal.id, {
        include: [
          {
            model: User,
            attributes: ['id', 'username', 'steam_trade_url'],
            as: 'user'
          },
          {
            model: UserInventory,
            attributes: ['id', 'item_id', 'acquisition_date', 'source'],
            as: 'items',
            include: [
              {
                model: Item,
                attributes: ['id', 'name', 'steam_market_hash_name', 'exterior', 'price'],
                as: 'item'
              }
            ]
          }
        ]
      });

      if (!fullWithdrawal || !fullWithdrawal.user) {
        logger.error(`Не найден пользователь для заявки #${withdrawal.id}`);
        await this.failWithdrawal(withdrawal, 'Пользователь не найден');
        return;
      }

      const user = fullWithdrawal.user;

      // Проверяем, есть ли у пользователя trade URL
      const userTradeUrl = user.steam_trade_url;
      if (!userTradeUrl) {
        logger.error(`У пользователя ${user.username} (ID: ${user.id}) не указан Steam Trade URL`);
        await this.failWithdrawal(withdrawal, 'Не указан Steam Trade URL. Укажите его в профиле и попробуйте снова.');
        return;
      }

      // Получаем предметы для вывода
      if (!fullWithdrawal.items || fullWithdrawal.items.length === 0) {
        logger.error(`Нет предметов для вывода в заявке #${withdrawal.id}`);
        await this.failWithdrawal(withdrawal, 'Нет предметов для вывода');
        return;
      }

      // Обрабатываем каждый предмет в заявке
      for (const inventoryItem of fullWithdrawal.items) {
        if (!inventoryItem.item) {
          logger.error(`Предмет не найден для inventory item #${inventoryItem.id}`);
          continue;
        }

        const item = inventoryItem.item;

        // Проверяем, есть ли предмет в инвентаре бота
        if (await this.checkItemInBotInventory(item)) {
          logger.info(`Предмет ${item.steam_market_hash_name} найден в инвентаре бота, отправляем...`);
          await this.sendItemFromBot(withdrawal, item, userTradeUrl);
        } else {
          // Если предмета нет - покупаем его (универсальный метод)
          logger.info(`Предмет ${item.steam_market_hash_name} не найден в инвентаре бота, ищем на маркетплейсах...`);
          await this.buyItemAndSend(withdrawal, item, userTradeUrl);
        }
      }
    } catch (error) {
      logger.error(`Ошибка при обработке заявки #${withdrawal.id}:`, error);
      await this.failWithdrawal(withdrawal, `Ошибка при обработке заявки: ${error.message}`);
      throw error;
    }
  }

  // Метод для покупки и отправки предмета
  async buyItemAndSend(withdrawal, item, userTradeUrl) {
    try {
      // CS.Money - единственный источник для покупки
      return await this.buyItemFromCSMoneyAndSend(withdrawal, item, userTradeUrl);
    } catch (error) {
      logger.error(`Ошибка при покупке предмета ${item.id}:`, error);
      await this.failWithdrawal(withdrawal, `Ошибка при покупке предмета: ${error.message}`);
      return false;
    }
  }

  // Метод для покупки и отправки предмета с CS.Money
  async buyItemFromCSMoneyAndSend(withdrawal, item, tradeUrl) {
    try {
      // Инициализация CS.Money
      await csmoneyService.initialize();
      if (!csmoneyService.isLoggedIn) {
        logger.error('Не удалось авторизоваться на CS.Money. Проверьте конфигурацию cookies.');
        await this.failWithdrawal(withdrawal, 'Не удалось авторизоваться на CS.Money. Проверьте конфигурацию сервиса.');
        return false;
      }

      // Проверяем баланс
      const balanceResult = await csmoneyService.getBalance();
      if (!balanceResult.success) {
        logger.error(`Не удалось получить баланс CS.Money: ${balanceResult.message}`);
        // Не отменяем заявку сразу, попробуем все равно найти и купить предмет
      } else {
        logger.info(`Текущий баланс на CS.Money: ${balanceResult.balance}`);
      }

      // Ищем предмет на CS.Money
      logger.info(`Поиск предмета ${item.steam_market_hash_name} (${item.exterior || 'любой износ'}) на CS.Money...`);
      const csmoneyItem = await csmoneyService.searchItem(item.steam_market_hash_name, item.exterior);

      if (!csmoneyItem.success) {
        logger.error(`Предмет ${item.steam_market_hash_name} не найден на CS.Money`);

        // Обновляем данные о заявке с информацией о поиске
        await withdrawal.update({
          tracking_data: {
            ...withdrawal.tracking_data,
            csmoney_search_attempted: true,
            csmoney_search_failed: true,
            search_time: new Date().toISOString()
          }
        });

        await this.failWithdrawal(withdrawal, 'Предмет не найден на CS.Money');
        return false;
      }

      return await this.processCSMoneyPurchase(withdrawal, item, csmoneyItem, tradeUrl);

    } catch (error) {
      logger.error(`Ошибка при покупке предмета на CS.Money (заявка #${withdrawal.id}):`, error);

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
          csmoney_purchase_error: errorInfo
        }
      });

      throw error;
    }
  }

  // Отдельный метод для обработки покупки после нахождения предмета на CS.Money
  async processCSMoneyPurchase(withdrawal, item, csmoneyItem, tradeUrl) {
    // Проверяем наличие доступных предложений
    if (!csmoneyItem.items || csmoneyItem.items.length === 0) {
      logger.error(`Нет доступных предложений для ${item.steam_market_hash_name} на CS.Money`);
      await this.failWithdrawal(withdrawal, 'Нет доступных предложений на CS.Money');
      return false;
    }

    // Сортируем предложения по цене (от низкой к высокой)
    const sortedOffers = csmoneyItem.items.sort((a, b) => a.price - b.price);
    const cheapestOffer = sortedOffers[0];

    logger.info(`Найдено ${sortedOffers.length} предложений на CS.Money`);
    logger.info(`Выбрано самое дешевое предложение: ${csmoneyItem.market_hash_name}, Цена: ${cheapestOffer.price}, ID: ${cheapestOffer.id}`);

    // Получаем баланс перед покупкой
    const balanceResult = await csmoneyService.getBalance();
    if (balanceResult.success && balanceResult.balance < cheapestOffer.price) {
      logger.error(`Недостаточно средств для покупки предмета. Баланс: ${balanceResult.balance}, Цена: ${cheapestOffer.price}`);
      await this.failWithdrawal(withdrawal, `Недостаточно средств на CS.Money. Баланс: ${balanceResult.balance}, Цена: ${cheapestOffer.price}`);
      return false;
    }

    // Покупаем предмет
    logger.info(`Покупка предмета ${csmoneyItem.market_hash_name} (ID: ${csmoneyItem.goods_id}, Asset ID: ${cheapestOffer.id})...`);
    const purchaseResult = await csmoneyService.buyItem(csmoneyItem.goods_id, cheapestOffer.id, cheapestOffer.price);

    if (!purchaseResult.success) {
      // Обработка специфичных ошибок
      if (purchaseResult.error_type === 'insufficient_balance') {
        logger.error(`Недостаточно средств для покупки: ${purchaseResult.message}`);
        await this.failWithdrawal(withdrawal, `Недостаточно средств на CS.Money: ${purchaseResult.message}`);
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
          const nextPurchaseResult = await csmoneyService.buyItem(csmoneyItem.goods_id, nextOffer.id, nextOffer.price);

          if (nextPurchaseResult.success) {
            logger.info(`Предмет успешно куплен (второе предложение) на CS.Money. Order ID: ${nextPurchaseResult.bill_no}`);

            // Обновляем данные о заявке
            await withdrawal.update({
              tracking_data: {
                ...withdrawal.tracking_data,
                csmoney_purchase: true,
                csmoney_order_id: nextPurchaseResult.bill_no,
                purchase_time: new Date().toISOString(),
                purchase_price: nextOffer.price,
                used_alternate_offer: true
              }
            });

            // Планируем проверку доставки
            return await this.scheduleDeliveryCheck(withdrawal);
          }
        }

        await this.failWithdrawal(withdrawal, `Предмет недоступен на CS.Money: ${purchaseResult.message}`);
        return false;
      }

      logger.error(`Ошибка покупки предмета на CS.Money: ${purchaseResult.message}`);
      await this.failWithdrawal(withdrawal, `Ошибка покупки на CS.Money: ${purchaseResult.message}`);
      return false;
    }

    logger.info(`Предмет успешно куплен на CS.Money. Order ID: ${purchaseResult.bill_no}`);

    // Обновляем данные о заявке
    await withdrawal.update({
      tracking_data: {
        ...withdrawal.tracking_data,
        csmoney_purchase: true,
        csmoney_order_id: purchaseResult.bill_no,
        purchase_time: new Date().toISOString(),
        purchase_price: cheapestOffer.price
      }
    });

    return await this.scheduleDeliveryCheck(withdrawal);
  }

  // Проверка статуса доставки предмета с CS.Money
  async checkCSMoneyItemDeliveryStatus(withdrawal) {
    try {
      if (!withdrawal.tracking_data || !withdrawal.tracking_data.csmoney_order_id) {
        logger.error(`Нет данных о покупке на CS.Money для заявки #${withdrawal.id}`);
        return false;
      }

      const orderId = withdrawal.tracking_data.csmoney_order_id;

      // Инициализируем CS.Money сервис
      await csmoneyService.initialize();

      // Проверяем статус доставки
      const deliveryStatus = await csmoneyService.checkItemDeliveryStatus(orderId);

      if (!deliveryStatus.success) {
        logger.error(`Ошибка при проверке статуса доставки для Order ID ${orderId}`);
        return false;
      }

      // Если предмет доставлен
      if (deliveryStatus.is_delivered) {
        logger.info(`Предмет доставлен по заказу ${orderId}`);

        // Обновляем заявку
        await withdrawal.update({
          status: 'completed',
          processing_end_date: new Date(),
          tracking_data: {
            ...withdrawal.tracking_data,
            delivered: true,
            delivery_time: new Date().toISOString(),
            delivery_status: deliveryStatus.status
          }
        });

        return true;
      } else {
        logger.info(`Предмет ещё не доставлен по заказу ${orderId}. Текущий статус: ${deliveryStatus.status}`);

        // Обновляем данные о заявке с информацией о текущем статусе
        await withdrawal.update({
          tracking_data: {
            ...withdrawal.tracking_data,
            last_check_time: new Date().toISOString(),
            last_check_status: deliveryStatus.status
          }
        });

        // Планируем следующую проверку
        const nextCheckTime = new Date(Date.now() + 5 * 60 * 1000); // через 5 минут
        await withdrawal.update({
          next_attempt_date: nextCheckTime,
          attempts: (withdrawal.attempts || 0) + 1
        });

        return false;
      }
    } catch (error) {
      logger.error(`Ошибка при проверке статуса доставки предмета с CS.Money:`, error);
      throw error;
    }
  }

  // Отправка предмета из инвентаря бота
  async sendItemFromBot(withdrawal, item, userTradeUrl) {
    try {
      logger.info(`Отправка предмета ${item.steam_market_hash_name} из инвентаря бота...`);

      // Инициализируем стим бота
      await steamBotService.initialize();

      // Поиск предмета в инвентаре
      const botInventory = await steamBotService.getInventory();
      const inventoryItem = botInventory.find(i =>
        i.market_hash_name === item.steam_market_hash_name &&
        (!item.exterior || i.exterior === item.exterior)
      );

      if (!inventoryItem) {
        logger.error(`Предмет ${item.steam_market_hash_name} не найден в инвентаре бота.`);

        // Обновляем tracking_data
        await withdrawal.update({
          tracking_data: {
            ...withdrawal.tracking_data,
            bot_inventory_check_failed: true,
            check_time: new Date().toISOString()
          }
        });

        // Т.к. предмета нет, пробуем его купить
        return await this.buyItemAndSend(withdrawal, item, userTradeUrl);
      }

      // Отправляем трейд
      logger.info(`Найден предмет ${inventoryItem.market_hash_name} (assetid: ${inventoryItem.assetid}), отправляем трейд...`);
      const tradeResult = await steamBotService.sendTrade(userTradeUrl, [inventoryItem.assetid]);

      if (tradeResult.success) {
        logger.info(`Трейд успешно отправлен. Trade ID: ${tradeResult.tradeOfferId}`);

        // Обновляем заявку
        await withdrawal.update({
          status: 'completed',
          processing_end_date: new Date(),
          tracking_data: {
            ...withdrawal.tracking_data,
            trade_sent: true,
            trade_offer_id: tradeResult.tradeOfferId,
            trade_send_time: new Date().toISOString()
          }
        });

        return true;
      } else {
        logger.error(`Ошибка при отправке трейда: ${tradeResult.message}`);
        await this.failWithdrawal(withdrawal, `Ошибка при отправке трейда: ${tradeResult.message}`);
        return false;
      }
    } catch (error) {
      logger.error(`Ошибка при отправке предмета из инвентаря бота:`, error);
      await this.failWithdrawal(withdrawal, `Ошибка при отправке предмета: ${error.message}`);
      throw error;
    }
  }

  // Проверка наличия предмета в инвентаре бота
  async checkItemInBotInventory(item) {
    try {
      logger.info(`Проверка наличия предмета ${item.steam_market_hash_name} в инвентаре бота...`);

      // Инициализируем стим бота
      await steamBotService.initialize();

      // Получаем инвентарь бота
      const botInventory = await steamBotService.getInventory();

      // Ищем предмет в инвентаре
      const found = botInventory.some(inventoryItem =>
        inventoryItem.market_hash_name === item.steam_market_hash_name &&
        (!item.exterior || inventoryItem.exterior === item.exterior)
      );

      if (found) {
        logger.info(`Предмет ${item.steam_market_hash_name} найден в инвентаре бота.`);
        return true;
      } else {
        logger.info(`Предмет ${item.steam_market_hash_name} не найден в инвентаре бота.`);
        return false;
      }
    } catch (error) {
      logger.error(`Ошибка при проверке инвентаря бота:`, error);
      return false;
    }
  }

  // Отметка заявки как неудачной
  async failWithdrawal(withdrawal, reason) {
    logger.warn(`Заявка #${withdrawal.id} отмечена как неудачная. Причина: ${reason}`);

    await withdrawal.update({
      status: 'failed',
      processing_end_date: new Date(),
      tracking_data: {
        ...withdrawal.tracking_data,
        failure_reason: reason,
        failure_time: new Date().toISOString()
      }
    });

    // Здесь можно добавить логику возврата средств пользователю, если это необходимо
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

  // Обработка всех ожидающих заявок
  async processAllPendingWithdrawals() {
    try {
      // Получаем все ожидающие заявки
      const pendingWithdrawals = await Withdrawal.findAll({
        where: {
          status: 'pending'
        }
      });

      logger.info(`Найдено ${pendingWithdrawals.length} ожидающих заявок на вывод`);

      if (pendingWithdrawals.length === 0) {
        return {
          success: true,
          successCount: 0,
          failCount: 0,
          totalCount: 0
        };
      }

      let successCount = 0;
      let failCount = 0;

      // Обрабатываем каждую заявку последовательно
      for (const withdrawal of pendingWithdrawals) {
        try {
          await this.processWithdrawal(withdrawal);
          successCount++;
        } catch (error) {
          logger.error(`Ошибка при обработке заявки #${withdrawal.id}:`, error);
          failCount++;
        }
      }

      return {
        success: true,
        successCount,
        failCount,
        totalCount: pendingWithdrawals.length
      };
    } catch (error) {
      logger.error('Ошибка при обработке ожидающих заявок:', error);
      return {
        success: false,
        successCount: 0,
        failCount: 0,
        totalCount: 0,
        error: error.message
      };
    }
  }

  // Обработка заявок, требующих проверки
  async processScheduledWithdrawals() {
    try {
      // Получаем заявки, которые требуют проверки
      const now = new Date();
      const scheduledWithdrawals = await Withdrawal.findAll({
        where: {
          status: 'processing',
          next_attempt_date: {
            [Op.lte]: now
          }
        }
      });

      logger.info(`Найдено ${scheduledWithdrawals.length} заявок, требующих проверки`);

      for (const withdrawal of scheduledWithdrawals) {
        logger.info(`Проверка заявки #${withdrawal.id}, запланированной на ${formatDate(withdrawal.next_attempt_date)}`);

        try {
          // Проверяем, есть ли данные о покупке
          if (withdrawal.tracking_data && withdrawal.tracking_data.csmoney_order_id) {
            await this.checkCSMoneyItemDeliveryStatus(withdrawal);
          }

          // Увеличиваем счетчик попыток
          if (withdrawal.attempts >= 10) {
            logger.warn(`Превышено максимальное количество попыток для заявки #${withdrawal.id}`);
            await this.failWithdrawal(withdrawal, 'Превышено максимальное количество попыток проверки');
          }
        } catch (error) {
          logger.error(`Ошибка при проверке заявки #${withdrawal.id}:`, error);
          // Планируем следующую попытку
          const nextCheckTime = new Date(Date.now() + 10 * 60 * 1000); // через 10 минут
          await withdrawal.update({
            next_attempt_date: nextCheckTime,
            attempts: (withdrawal.attempts || 0) + 1
          });
        }
      }

      return scheduledWithdrawals.length;
    } catch (error) {
      logger.error('Ошибка при обработке запланированных заявок:', error);
      throw error;
    }
  }

  // Метод для создания новой заявки на вывод
  async createWithdrawal(userId, inventoryItemIds) {
    try {
      // Проверяем, существует ли пользователь
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('Пользователь не найден');
      }

      // Проверяем trade URL пользователя
      if (!user.steam_trade_url) {
        throw new Error('У пользователя не указан Steam Trade URL');
      }

      // Если передан одиночный ID предмета, преобразуем в массив
      const itemIds = Array.isArray(inventoryItemIds) ? inventoryItemIds : [inventoryItemIds];

      // Проверяем, существуют ли предметы в инвентаре пользователя
      const userInventoryItems = await UserInventory.findAll({
        where: {
          id: itemIds,
          user_id: userId,
          status: 'inventory'
        },
        include: [
          {
            model: Item,
            attributes: ['id', 'name', 'steam_market_hash_name', 'exterior', 'price'],
            as: 'item'
          }
        ]
      });

      if (userInventoryItems.length === 0) {
        throw new Error('Предметы не найдены в инвентаре пользователя или уже выведены');
      }

      if (userInventoryItems.length !== itemIds.length) {
        throw new Error('Некоторые предметы не найдены в инвентаре');
      }

      // Создаем заявку на вывод
      const withdrawal = await Withdrawal.create({
        user_id: userId,
        steam_trade_url: user.steam_trade_url,
        status: 'pending',
        total_items_count: userInventoryItems.length,
        total_items_value: userInventoryItems.reduce((sum, item) => sum + parseFloat(item.item.price || 0), 0),
        tracking_data: {
          created_time: new Date().toISOString(),
          inventory_item_ids: itemIds
        }
      });

      // Обновляем статус предметов в инвентаре и связываем их с заявкой
      for (const inventoryItem of userInventoryItems) {
        await inventoryItem.update({
          status: 'withdrawn',
          withdrawal_id: withdrawal.id,
          transaction_date: new Date()
        });
      }

      logger.info(`Создана заявка на вывод #${withdrawal.id} для пользователя ${user.username} (ID: ${userId}), предметов: ${userInventoryItems.length}`);

      return withdrawal;
    } catch (error) {
      logger.error('Ошибка при создании заявки на вывод:', error);
      throw error;
    }
  }

  // Получение ожидающих заявок на вывод
  async getPendingWithdrawals() {
    try {
      const pendingWithdrawals = await Withdrawal.findAll({
        where: {
          status: 'pending'
        },
        include: [
          {
            model: User,
            attributes: ['id', 'username', 'steam_trade_url'],
            as: 'user'
          },
          {
            model: UserInventory,
            attributes: ['id', 'item_id', 'acquisition_date', 'source'],
            as: 'items',
            include: [
              {
                model: Item,
                attributes: ['id', 'name', 'steam_market_hash_name', 'exterior', 'price'],
                as: 'item'
              }
            ]
          }
        ],
        order: [['createdAt', 'ASC']]
      });

      logger.info(`Найдено ${pendingWithdrawals.length} ожидающих заявок на вывод`);
      return pendingWithdrawals;
    } catch (error) {
      logger.error('Ошибка при получении ожидающих заявок:', error);
      throw error;
    }
  }

  // Получение статистики по заявкам
  async getWithdrawalStats(days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const stats = await Withdrawal.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: {
          createdAt: {
            [Op.gte]: startDate
          }
        },
        group: ['status']
      });

      // Форматируем результат
      const formattedStats = {};
      stats.forEach(stat => {
        formattedStats[stat.status] = parseInt(stat.get('count'));
      });

      // Добавляем общее количество
      formattedStats.total = Object.values(formattedStats).reduce((sum, count) => sum + count, 0);

      return formattedStats;
    } catch (error) {
      logger.error('Ошибка при получении статистики по заявкам:', error);
      throw error;
    }
  }
}

module.exports = new WithdrawalService();
