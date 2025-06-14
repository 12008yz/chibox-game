const { Withdrawal, Item, User, UserInventory } = require('../models');
const winston = require('winston');
const SteamMarketService = require('./steamMarketService');
const SteamBot = require('./steamBotService');
const steamBotConfig = require('../config/steam_bot.js');

// Логгер
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'steam-withdrawal.log' })
  ],
});

class SteamWithdrawalService {
  constructor() {
    // Инициализируем Steam Market сервис
    this.steamMarket = new SteamMarketService(SteamMarketService.loadConfig());

    // Инициализируем Steam Bot для отправки трейдов
    this.steamBot = new SteamBot(
      steamBotConfig.accountName,
      steamBotConfig.password,
      steamBotConfig.sharedSecret,
      steamBotConfig.identitySecret
    );
  }

  /**
   * Обработка заявки на вывод предмета
   */
  async processWithdrawal(withdrawal) {
    try {
      logger.info(`🎯 Начинаем обработку заявки #${withdrawal.id}`);

      // Получаем полные данные заявки
      const fullWithdrawal = await this.getWithdrawalData(withdrawal.id);
      if (!fullWithdrawal) {
        return await this.failWithdrawal(withdrawal, 'Данные заявки не найдены');
      }

      const { user, items } = fullWithdrawal;

      // Проверяем trade URL пользователя
      if (!user.steam_trade_url) {
        return await this.failWithdrawal(withdrawal, 'Trade URL не указан');
      }

      // Обновляем статус на "обработка"
      await withdrawal.update({
        status: 'processing',
        tracking_data: {
          ...withdrawal.tracking_data,
          processing_start: new Date().toISOString()
        }
      });

      // Обрабатываем каждый предмет в заявке
      const processedItems = [];

      for (const userItem of items) {
        const item = userItem.item;
        logger.info(`📦 Обработка предмета: ${item.name}`);

        // Покупаем предмет в Steam Market
        const purchaseResult = await this.purchaseItemFromMarket(item);

        if (purchaseResult.success) {
          processedItems.push({
            item_id: item.id,
            purchase_result: purchaseResult,
            status: 'purchased'
          });

          logger.info(`✅ Предмет ${item.name} успешно куплен за ${purchaseResult.item.purchasePrice}`);
        } else {
          logger.error(`❌ Ошибка покупки ${item.name}: ${purchaseResult.message}`);

          // Если один предмет не удалось купить, прерываем обработку
          return await this.failWithdrawal(withdrawal, `Не удалось купить ${item.name}: ${purchaseResult.message}`);
        }
      }

      // Если все предметы куплены, ждем и отправляем трейд
      logger.info(`⏱️ Ожидаем получение предметов в инвентарь бота...`);

      // Ждем 30 секунд чтобы предметы появились в инвентаре
      await this.delay(30000);

      // Отправляем trade offer пользователю
      const tradeResult = await this.sendTradeOffer(user.steam_trade_url, processedItems);

      if (tradeResult.success) {
        // Обновляем статус заявки
        await withdrawal.update({
          status: 'direct_trade_sent',
          steam_trade_offer_id: tradeResult.tradeOfferId,
          steam_trade_status: 'sent',
          processing_date: new Date(),
          tracking_data: {
            ...withdrawal.tracking_data,
            purchased_items: processedItems,
            trade_offer_id: tradeResult.tradeOfferId,
            trade_sent_time: new Date().toISOString(),
            total_cost: processedItems.reduce((sum, item) => sum + item.purchase_result.item.purchasePrice, 0)
          }
        });

        // Статус предметов в UserInventory уже установлен как 'withdrawn' в контроллере
        // Дополнительное обновление не требуется

        logger.info(`✅ Заявка #${withdrawal.id} успешно обработана. Trade offer ID: ${tradeResult.tradeOfferId}`);
        return { success: true, trade_offer_id: tradeResult.tradeOfferId };
      } else {
        return await this.failWithdrawal(withdrawal, `Ошибка отправки trade offer: ${tradeResult.message}`);
      }

    } catch (error) {
      logger.error(`💥 Критическая ошибка обработки заявки #${withdrawal.id}: ${error.message}`);
      return await this.failWithdrawal(withdrawal, `Системная ошибка: ${error.message}`);
    }
  }

  /**
   * Покупка предмета в Steam Market
   */
  async purchaseItemFromMarket(item) {
    try {
      const marketHashName = item.steam_market_hash_name || item.name;
      const maxPrice = item.price * 1.1; // Максимум 110% от базовой цены

      logger.info(`🛒 Покупаем предмет ${marketHashName} (макс. цена: ${maxPrice})`);

      const result = await this.steamMarket.purchaseItemFromMarket(marketHashName, maxPrice);

      if (result.success) {
        logger.info(`✅ Предмет успешно куплен за ${result.item.purchasePrice}`);
      }

      return result;
    } catch (error) {
      logger.error(`Ошибка покупки предмета ${item.name}: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Отправка trade offer пользователю
   */
  async sendTradeOffer(userTradeUrl, purchasedItems) {
    try {
      logger.info(`📤 Отправляем trade offer пользователю...`);

      // Проверяем, что бот авторизован
      if (!this.steamBot.isLoggedIn) {
        await this.steamBot.login();
      }

      // Получаем актуальный инвентарь бота
      const botInventory = await this.steamBot.getInventory();
      if (!botInventory.success) {
        return {
          success: false,
          message: 'Не удалось получить инвентарь бота'
        };
      }

      // Находим купленные предметы в инвентаре бота
      const itemsToTrade = [];
      for (const purchasedItem of purchasedItems) {
        // Ищем предмет по названию и времени покупки
        const inventoryItem = this.findItemInInventory(botInventory.items, purchasedItem);
        if (inventoryItem) {
          itemsToTrade.push(inventoryItem);
        } else {
          logger.warn(`⚠️ Предмет не найден в инвентаре бота: ${purchasedItem.item_id}`);
        }
      }

      if (!itemsToTrade.length) {
        return {
          success: false,
          message: 'Купленные предметы не найдены в инвентаре бота'
        };
      }

      // Отправляем trade offer
      const tradeOfferResult = await this.steamBot.sendTradeOffer(userTradeUrl, itemsToTrade, []);

      if (tradeOfferResult.success) {
        logger.info(`✅ Trade offer отправлен! ID: ${tradeOfferResult.tradeOfferId}`);
        return {
          success: true,
          tradeOfferId: tradeOfferResult.tradeOfferId
        };
      } else {
        return {
          success: false,
          message: tradeOfferResult.message
        };
      }

    } catch (error) {
      logger.error(`Ошибка отправки trade offer: ${error.message}`);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Поиск предмета в инвентаре бота
   */
  findItemInInventory(botInventory, purchasedItem) {
    // Простая логика поиска по названию
    // В реальности можно усложнить поиск по asset_id, времени и т.д.
    return botInventory.find(invItem =>
      invItem.market_hash_name === purchasedItem.purchase_result.item.marketHashName
    );
  }

  /**
   * Получение данных заявки с пользователем и предметами
   */
  async getWithdrawalData(withdrawalId) {
    try {
      return await Withdrawal.findByPk(withdrawalId, {
        include: [
          {
            model: User,
            attributes: ['id', 'username', 'steam_trade_url'],
            as: 'user'
          },
          {
            model: UserInventory,
            attributes: ['id', 'item_id'],
            as: 'items',
            include: [
              {
                model: Item,
                attributes: ['id', 'name', 'steam_market_hash_name', 'price'],
                as: 'item'
              }
            ]
          }
        ]
      });
    } catch (error) {
      logger.error(`Ошибка получения данных заявки: ${error.message}`);
      return null;
    }
  }

  /**
   * Отметка заявки как неудачной
   */
  async failWithdrawal(withdrawal, reason) {
    try {
      // Обновляем статус заявки
      await withdrawal.update({
        status: 'failed',
        failed_reason: reason,
        completion_date: new Date(),
        tracking_data: {
          ...withdrawal.tracking_data,
          failure_reason: reason,
          failure_time: new Date().toISOString()
        }
      });

      // Откатываем статус предметов обратно в инвентарь
      await UserInventory.update(
        {
          status: 'inventory',
          transaction_date: null,
          withdrawal_id: null
        },
        {
          where: {
            withdrawal_id: withdrawal.id,
            status: 'withdrawn'
          }
        }
      );

      logger.error(`❌ Заявка #${withdrawal.id} отмечена как неудачная: ${reason}`);
      logger.info(`🔄 Статус предметов откачен обратно в инвентарь для заявки #${withdrawal.id}`);

      return { success: false, message: reason };
    } catch (error) {
      logger.error(`❌ Ошибка при отметке заявки как неудачной: ${error.message}`);
      return { success: false, message: reason };
    }
  }

  /**
   * Задержка
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Проверка статуса отправленных trade offers
   */
  async checkTradeOfferStatuses() {
    try {
      logger.info('🔍 Проверяем статусы отправленных trade offers...');

      const sentWithdrawals = await Withdrawal.findAll({
        where: {
          status: 'direct_trade_sent',
          steam_trade_offer_id: { [require('sequelize').Op.ne]: null }
        },
        order: [['created_at', 'ASC']]
      });

      if (!sentWithdrawals.length) {
        logger.info('📝 Нет отправленных trade offers для проверки');
        return { success: true, checked: 0 };
      }

      logger.info(`📋 Найдено ${sentWithdrawals.length} trade offers для проверки`);
      let completedCount = 0;
      let failedCount = 0;

      for (const withdrawal of sentWithdrawals) {
        try {
          const tradeStatus = await this.steamBot.getTradeOfferStatus(withdrawal.steam_trade_offer_id);

          if (tradeStatus.state === 'Accepted') {
            // Trade offer принят - отмечаем как завершенный
            await withdrawal.update({
              status: 'completed',
              steam_trade_status: 'accepted',
              completion_date: new Date(),
              tracking_data: {
                ...withdrawal.tracking_data,
                completion_time: new Date().toISOString(),
                trade_accepted_time: new Date().toISOString()
              }
            });

            logger.info(`✅ Trade offer ${withdrawal.steam_trade_offer_id} принят. Заявка #${withdrawal.id} завершена`);
            completedCount++;

          } else if (tradeStatus.state === 'Declined' || tradeStatus.state === 'Canceled') {
            // Trade offer отклонен или отменен - возвращаем предметы
            await this.failWithdrawal(withdrawal, `Trade offer ${tradeStatus.state.toLowerCase()}: ${tradeStatus.message || 'Неизвестная причина'}`);
            failedCount++;

          } else if (tradeStatus.state === 'Invalid') {
            // Trade offer недействителен - возвращаем предметы
            await this.failWithdrawal(withdrawal, `Trade offer недействителен: ${tradeStatus.message || 'Неизвестная причина'}`);
            failedCount++;
          }
          // Остальные статусы (например, Pending) - оставляем без изменений

        } catch (error) {
          logger.error(`Ошибка проверки trade offer ${withdrawal.steam_trade_offer_id}: ${error.message}`);
        }

        // Небольшая задержка между проверками
        await this.delay(1000);
      }

      logger.info(`✅ Проверка завершена. Завершено: ${completedCount}, Не удалось: ${failedCount}`);

      return {
        success: true,
        checked: sentWithdrawals.length,
        completed: completedCount,
        failed: failedCount
      };

    } catch (error) {
      logger.error(`Критическая ошибка проверки trade offers: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Обработка всех ожидающих заявок
   */
  async processAllPendingWithdrawals() {
    try {
      logger.info('🚀 Начинаем обработку всех ожидающих заявок...');

      const pendingWithdrawals = await Withdrawal.findAll({
        where: { status: 'pending' },
        order: [['created_at', 'ASC']]
      });

      if (!pendingWithdrawals.length) {
        logger.info('📝 Нет ожидающих заявок');
        return { success: true, processed: 0 };
      }

      logger.info(`📋 Найдено ${pendingWithdrawals.length} заявок для обработки`);

      let successCount = 0;
      let errorCount = 0;

      for (const withdrawal of pendingWithdrawals) {
        const result = await this.processWithdrawal(withdrawal);

        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }

        // Небольшая задержка между обработкой заявок
        await this.delay(5000);
      }

      logger.info(`✅ Обработка завершена. Успешно: ${successCount}, Ошибок: ${errorCount}`);

      return {
        success: true,
        processed: pendingWithdrawals.length,
        successful: successCount,
        failed: errorCount
      };

    } catch (error) {
      logger.error(`Критическая ошибка обработки заявок: ${error.message}`);
      return { success: false, message: error.message };
    }
  }
}

module.exports = SteamWithdrawalService;
