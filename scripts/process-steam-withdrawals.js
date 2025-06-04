#!/usr/bin/env node

/**
 * Улучшенный процессор Steam withdrawal с автоматической покупкой и отправкой
 */

const SteamWithdrawalService = require('../services/steamWithdrawalService');
const SteamMarketService = require('../services/steamMarketService');
const { Withdrawal } = require('../models');
const winston = require('winston');
const cron = require('node-cron');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: 'steam-withdrawal-processor.log',
      format: winston.format.json()
    })
  ],
});

class SteamWithdrawalProcessor {
  constructor() {
    this.withdrawalService = new SteamWithdrawalService();
    this.isProcessing = false;
    this.lastProcessTime = null;
    this.stats = {
      totalProcessed: 0,
      successfulWithdrawals: 0,
      failedWithdrawals: 0,
      totalCost: 0
    };
  }

  /**
   * Основной метод обработки withdrawal
   */
  async processWithdrawals() {
    if (this.isProcessing) {
      logger.warn('⚠️ Обработка уже выполняется, пропускаем...');
      return;
    }

    this.isProcessing = true;
    logger.info('🚀 Начинаем обработку Steam withdrawal...');

    try {
      // Получаем все pending withdrawal
      const pendingWithdrawals = await this.getPendingWithdrawals();

      if (!pendingWithdrawals.length) {
        logger.info('📝 Нет ожидающих withdrawal для обработки');
        return;
      }

      logger.info(`📋 Найдено ${pendingWithdrawals.length} withdrawal для обработки`);

      // Обрабатываем по одному
      for (const withdrawal of pendingWithdrawals) {
        await this.processSingleWithdrawal(withdrawal);

        // Задержка между обработкой
        await this.delay(10000); // 10 секунд между withdrawal
      }

      logger.info('✅ Обработка всех withdrawal завершена');
      this.lastProcessTime = new Date();

    } catch (error) {
      logger.error('💥 Критическая ошибка обработки withdrawal:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Обработка одного withdrawal
   */
  async processSingleWithdrawal(withdrawal) {
    const startTime = Date.now();
    logger.info(`🎯 Обработка withdrawal #${withdrawal.id}`);

    try {
      // Получаем детальную информацию о withdrawal
      const withdrawalData = await this.getWithdrawalDetails(withdrawal.id);

      if (!withdrawalData) {
        await this.markWithdrawalFailed(withdrawal, 'Не удалось получить данные withdrawal');
        return;
      }

      const { user, items } = withdrawalData;

      // Проверяем trade URL
      if (!user.steam_trade_url) {
        await this.markWithdrawalFailed(withdrawal, 'Отсутствует trade URL пользователя');
        return;
      }

      // Обновляем статус
      await withdrawal.update({
        status: 'processing',
        tracking_data: {
          ...withdrawal.tracking_data,
          processing_start: new Date().toISOString(),
          processor_version: '2.0'
        }
      });

      // Покупаем предметы
      const purchaseResults = await this.purchaseItems(items);

      if (!purchaseResults.success) {
        await this.markWithdrawalFailed(withdrawal, purchaseResults.message);
        return;
      }

      // Ждем появления предметов в инвентаре
      logger.info('⏱️ Ожидаем появления предметов в инвентаре...');
      await this.delay(30000); // 30 секунд

      // Отправляем trade offer
      const tradeResult = await this.sendTradeOffer(user.steam_trade_url, purchaseResults.items);

      if (tradeResult.success) {
        // Успешно отправлен trade
        await withdrawal.update({
          status: 'trade_sent',
          tracking_data: {
            ...withdrawal.tracking_data,
            trade_offer_id: tradeResult.tradeOfferId,
            trade_sent_time: new Date().toISOString(),
            purchase_results: purchaseResults,
            processing_time_ms: Date.now() - startTime
          }
        });

        this.stats.successfulWithdrawals++;
        this.stats.totalCost += purchaseResults.totalCost;

        logger.info(`✅ Withdrawal #${withdrawal.id} успешно обработан. Trade ID: ${tradeResult.tradeOfferId}`);
      } else {
        await this.markWithdrawalFailed(withdrawal, `Ошибка отправки trade: ${tradeResult.message}`);
      }

    } catch (error) {
      logger.error(`💥 Ошибка обработки withdrawal #${withdrawal.id}:`, error);
      await this.markWithdrawalFailed(withdrawal, `Системная ошибка: ${error.message}`);
    }

    this.stats.totalProcessed++;
  }

  /**
   * Покупка предметов для withdrawal
   */
  async purchaseItems(items) {
    logger.info(`🛒 Покупаем ${items.length} предметов...`);

    const purchasedItems = [];
    let totalCost = 0;

    try {
      // Инициализируем Steam Market с актуальной сессией
      const config = await SteamMarketService.loadConfigFromBot();
      const steamMarket = new SteamMarketService(config);

      for (const userItem of items) {
        const item = userItem.item;
        const marketHashName = item.steam_market_hash_name || item.name;
        const maxPrice = item.price * 1.2; // Максимум 120% от базовой цены

        logger.info(`🔍 Покупаем: ${marketHashName} (макс. ${maxPrice} руб.)`);

        const purchaseResult = await steamMarket.purchaseItemFromMarket(marketHashName, maxPrice);

        if (purchaseResult.success) {
          purchasedItems.push({
            item_id: item.id,
            market_hash_name: marketHashName,
            purchase_price: purchaseResult.item.purchasePrice,
            purchase_time: purchaseResult.item.purchaseTime,
            asset_id: purchaseResult.item.assetId
          });

          totalCost += purchaseResult.item.purchasePrice;
          logger.info(`✅ ${marketHashName} куплен за ${purchaseResult.item.purchasePrice} руб.`);
        } else {
          logger.error(`❌ Не удалось купить ${marketHashName}: ${purchaseResult.message}`);
          return {
            success: false,
            message: `Не удалось купить ${marketHashName}: ${purchaseResult.message}`
          };
        }

        // Задержка между покупками
        await this.delay(5000);
      }

      return {
        success: true,
        items: purchasedItems,
        totalCost: totalCost,
        count: purchasedItems.length
      };

    } catch (error) {
      logger.error('💥 Критическая ошибка покупки предметов:', error);
      return {
        success: false,
        message: `Критическая ошибка покупки: ${error.message}`
      };
    }
  }

  /**
   * Отправка trade offer
   */
  async sendTradeOffer(tradeUrl, purchasedItems) {
    try {
      logger.info('📤 Отправляем trade offer...');

      // Используем withdrawal service для отправки trade
      const result = await this.withdrawalService.sendTradeOffer(tradeUrl, purchasedItems);

      return result;

    } catch (error) {
      logger.error('💥 Ошибка отправки trade offer:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Получение pending withdrawal
   */
  async getPendingWithdrawals() {
    try {
      return await Withdrawal.findAll({
        where: {
          status: 'pending',
          withdrawal_type: 'steam'
        },
        order: [['created_at', 'ASC']],
        limit: 10 // Обрабатываем максимум 10 за раз
      });
    } catch (error) {
      logger.error('Ошибка получения pending withdrawal:', error);
      return [];
    }
  }

  /**
   * Получение детальной информации о withdrawal
   */
  async getWithdrawalDetails(withdrawalId) {
    try {
      const { User, UserInventory, Item } = require('../models');

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
      logger.error(`Ошибка получения данных withdrawal ${withdrawalId}:`, error);
      return null;
    }
  }

  /**
   * Отметка withdrawal как неудачного
   */
  async markWithdrawalFailed(withdrawal, reason) {
    try {
      await withdrawal.update({
        status: 'failed',
        tracking_data: {
          ...withdrawal.tracking_data,
          failure_reason: reason,
          failure_time: new Date().toISOString()
        }
      });

      this.stats.failedWithdrawals++;
      logger.error(`❌ Withdrawal #${withdrawal.id} отмечен как неудачный: ${reason}`);
    } catch (error) {
      logger.error(`Ошибка обновления статуса withdrawal #${withdrawal.id}:`, error);
    }
  }

  /**
   * Задержка
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Получение статистики
   */
  getStats() {
    return {
      ...this.stats,
      lastProcessTime: this.lastProcessTime,
      isProcessing: this.isProcessing
    };
  }

  /**
   * Запуск планировщика
   */
  startScheduler() {
    logger.info('⏰ Запускаем планировщик withdrawal (каждые 5 минут)...');

    // Каждые 5 минут
    cron.schedule('*/5 * * * *', async () => {
      logger.info('⏰ Планировщик: проверка новых withdrawal...');
      await this.processWithdrawals();
    });

    // Каждый час выводим статистику
    cron.schedule('0 * * * *', () => {
      const stats = this.getStats();
      logger.info('📊 Статистика withdrawal за час:', stats);
    });

    logger.info('✅ Планировщик запущен');
  }

  /**
   * Остановка процессора
   */
  async shutdown() {
    logger.info('🛑 Завершение работы withdrawal processor...');

    if (this.withdrawalService && this.withdrawalService.steamBot) {
      await this.withdrawalService.steamBot.shutdown();
    }

    logger.info('✅ Withdrawal processor остановлен');
  }
}

// Функции для CLI использования
async function processOnce() {
  const processor = new SteamWithdrawalProcessor();

  try {
    await processor.processWithdrawals();
    logger.info('📊 Финальная статистика:', processor.getStats());
  } catch (error) {
    logger.error('💥 Ошибка обработки:', error);
  } finally {
    await processor.shutdown();
    process.exit(0);
  }
}

async function startScheduler() {
  const processor = new SteamWithdrawalProcessor();

  try {
    processor.startScheduler();

    // Сразу запускаем первую обработку
    await processor.processWithdrawals();

    // Обработчики сигналов для корректного завершения
    process.on('SIGINT', async () => {
      logger.info('Получен SIGINT, завершаем работу...');
      await processor.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Получен SIGTERM, завершаем работу...');
      await processor.shutdown();
      process.exit(0);
    });

    logger.info('🎯 Withdrawal processor запущен в режиме демона');

  } catch (error) {
    logger.error('💥 Критическая ошибка:', error);
    await processor.shutdown();
    process.exit(1);
  }
}

// CLI интерфейс
if (require.main === module) {
  const command = process.argv[2];

  switch (command) {
    case 'once':
      processOnce();
      break;
    case 'daemon':
    case 'scheduler':
      startScheduler();
      break;
    default:
      logger.info('📖 Использование:');
      logger.info('  node process-steam-withdrawals-improved.js once     - Однократная обработка');
      logger.info('  node process-steam-withdrawals-improved.js daemon   - Запуск в режиме демона');
      process.exit(1);
  }
}

module.exports = SteamWithdrawalProcessor;
