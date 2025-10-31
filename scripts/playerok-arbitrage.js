#!/usr/bin/env node

/**
 * PlayerOk Арбитраж Бот
 *
 * Мониторит pending withdrawals → Ищет на PlayerOk → Сравнивает цены → Покупает если выгодно
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Withdrawal, User, UserInventory, Item } = require('../models');
const PlayerOkBot = require('../services/playerokBotService');
const steamPriceService = require('../services/steamPriceService');
const winston = require('winston');
const { Op } = require('sequelize');

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
    new winston.transports.File({ filename: 'playerok-arbitrage.log' })
  ],
});

// Глобальные настройки
const CONFIG = {
  CHECK_INTERVAL: 30000, // Проверять каждые 30 секунд
  MIN_MARGIN_PERCENT: 0, // Минимальная маржа 0% (главное - не дороже Steam/ChiBox)
  MAX_ATTEMPTS: 3, // Максимум попыток поиска
};

class PlayerOkArbitrageBot {
  constructor() {
    this.playerokBot = new PlayerOkBot();
    this.isRunning = false;
    this.processedWithdrawals = new Set(); // Чтобы не обрабатывать повторно
  }

  /**
   * Запуск бота
   */
  async start() {
    try {
      logger.info('🚀 Запуск PlayerOk Arbitrage Bot...');

      // Инициализируем PlayerOk бота
      const isLoggedIn = await this.playerokBot.init();

      if (!isLoggedIn) {
        logger.error('❌ Не удалось авторизоваться на PlayerOk. Проверьте cookies!');
        process.exit(1);
      }

      this.isRunning = true;
      logger.info('✅ Бот запущен и готов к работе');

      // Запускаем цикл мониторинга
      await this.monitorWithdrawals();

    } catch (error) {
      logger.error('❌ Критическая ошибка при запуске:', error);
      await this.stop();
      process.exit(1);
    }
  }

  /**
   * Мониторинг pending withdrawals
   */
  async monitorWithdrawals() {
    while (this.isRunning) {
      try {
        logger.info('🔍 Проверка pending withdrawals...');

        // Находим все pending заявки
        const pendingWithdrawals = await Withdrawal.findAll({
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
                  attributes: ['id', 'name', 'price', 'steam_market_hash_name', 'image_url']
                }
              ]
            }
          ],
          order: [['request_date', 'ASC']],
          limit: 10 // Обрабатываем по 10 за раз
        });

        if (pendingWithdrawals.length === 0) {
          logger.info('ℹ️ Нет pending withdrawals для обработки');
        } else {
          logger.info(`📦 Найдено ${pendingWithdrawals.length} заявок на обработку`);

          for (const withdrawal of pendingWithdrawals) {
            // Пропускаем уже обработанные
            if (this.processedWithdrawals.has(withdrawal.id)) {
              continue;
            }

            await this.processWithdrawal(withdrawal);

            // Добавляем в обработанные
            this.processedWithdrawals.add(withdrawal.id);

            // Пауза между обработкой заявок
            await this.sleep(5000);
          }
        }

        // Очищаем Set если он стал слишком большим
        if (this.processedWithdrawals.size > 1000) {
          this.processedWithdrawals.clear();
        }

        // Ждём перед следующей проверкой
        await this.sleep(CONFIG.CHECK_INTERVAL);

      } catch (error) {
        logger.error('❌ Ошибка в цикле мониторинга:', error);
        await this.sleep(10000); // Ждём 10 сек перед повтором
      }
    }
  }

  /**
   * Обработка одной заявки на вывод
   */
  async processWithdrawal(withdrawal) {
    try {
      logger.info(`\n${'='.repeat(60)}`);
      logger.info(`📋 Обработка withdrawal ID: ${withdrawal.id}`);
      logger.info(`👤 Пользователь: ${withdrawal.user.username}`);

      // Обновляем статус на "processing"
      await withdrawal.update({
        status: 'processing',
        processing_date: new Date()
      });

      // Обрабатываем каждый предмет в заявке
      for (const inventoryItem of withdrawal.items) {
        const item = inventoryItem.item;

        if (!item) {
          logger.warn(`⚠️ Предмет не найден для inventory item ${inventoryItem.id}`);
          continue;
        }

        logger.info(`\n🎮 Предмет: ${item.name}`);
        logger.info(`💰 Цена ChiBox: ${item.price}₽`);

        // 1. Получаем актуальную цену Steam
        const steamPrice = await this.getSteamPrice(item);
        logger.info(`💵 Цена Steam: ${steamPrice}₽`);

        // 2. Ищем предмет на PlayerOk
        const playerokOffers = await this.playerokBot.searchItem(
          item.name,
          Math.max(steamPrice, item.price) // Ищем не дороже максимума из Steam/ChiBox
        );

        if (playerokOffers.length === 0) {
          logger.warn(`⚠️ Предмет не найден на PlayerOk или слишком дорогой`);

          // Ищем альтернативы
          await this.findAlternative(withdrawal, item, steamPrice);
          continue;
        }

        // 3. Берём лучшее предложение
        const bestOffer = playerokOffers[0];
        logger.info(`🏆 Лучшее предложение: ${bestOffer.price}₽ от ${bestOffer.seller}`);

        // 4. Сравниваем цены
        const comparison = this.playerokBot.comparePrices(
          bestOffer.price,
          steamPrice,
          item.price
        );

        logger.info(`📊 Анализ цен:`);
        logger.info(`   PlayerOk (с комиссией): ${comparison.total_cost.toFixed(2)}₽`);
        logger.info(`   Решение: ${comparison.decision}`);
        logger.info(`   Причина: ${comparison.reason}`);

        // 5. Принимаем решение о покупке
        if (comparison.decision === 'buy') {
          logger.info(`✅ ПОКУПАЕМ! Profit: ${comparison.profit_vs_chibox.toFixed(2)}₽`);

          // Покупаем предмет
          const purchaseResult = await this.playerokBot.purchaseItem(
            bestOffer.url,
            withdrawal.steam_trade_url || withdrawal.user.steam_trade_url
          );

          if (purchaseResult.success) {
            logger.info(`✅ Покупка успешна! Заказ: ${purchaseResult.order_number}`);

            // Отправляем Trade URL в чат продавца
            if (purchaseResult.order_number) {
              await this.playerokBot.sendTradeUrlToSeller(
                purchaseResult.order_number,
                withdrawal.steam_trade_url || withdrawal.user.steam_trade_url
              );
            }

            // Обновляем withdrawal
            await withdrawal.update({
              status: 'processing', // Ждём пока продавец отправит трейд
              admin_notes: `PlayerOk заказ: ${purchaseResult.order_number}. Цена: ${bestOffer.price}₽. Прибыль: ${comparison.profit_vs_chibox.toFixed(2)}₽`
            });

            logger.info(`✅ Withdrawal обновлён, ожидаем отправку трейда от продавца`);

          } else {
            logger.error(`❌ Ошибка покупки: ${purchaseResult.error}`);
            await withdrawal.update({
              status: 'failed',
              failed_reason: `Ошибка покупки на PlayerOk: ${purchaseResult.error}`
            });
          }

        } else {
          logger.warn(`❌ НЕ ПОКУПАЕМ: ${comparison.reason}`);

          // Ищем альтернативы
          await this.findAlternative(withdrawal, item, steamPrice);
        }
      }

    } catch (error) {
      logger.error(`❌ Ошибка обработки withdrawal ${withdrawal.id}:`, error);

      await withdrawal.update({
        status: 'failed',
        failed_reason: `Ошибка: ${error.message}`,
        processing_attempts: (withdrawal.processing_attempts || 0) + 1
      });
    }
  }

  /**
   * Получение актуальной цены Steam
   */
  async getSteamPrice(item) {
    try {
      if (!item.steam_market_hash_name) {
        logger.warn(`⚠️ Нет steam_market_hash_name для ${item.name}`);
        return item.price; // Используем цену ChiBox как fallback
      }

      // Используем существующий сервис для получения цены Steam
      const priceData = await steamPriceService.getItemPrice(item.steam_market_hash_name);

      if (priceData && priceData.median_price) {
        // Конвертируем в рубли (если нужно)
        const priceInRub = this.convertToRubles(priceData.median_price);
        return priceInRub;
      }

      return item.price;
    } catch (error) {
      logger.error(`❌ Ошибка получения цены Steam для ${item.name}:`, error);
      return item.price;
    }
  }

  /**
   * Конвертация цены в рубли
   */
  convertToRubles(priceString) {
    try {
      // Извлекаем числовое значение
      const numericValue = parseFloat(priceString.replace(/[^\d.,]/g, '').replace(',', '.'));

      // Если цена в долларах, конвертируем (примерный курс 90₽/$)
      if (priceString.includes('$')) {
        return numericValue * 90;
      }

      return numericValue;
    } catch (error) {
      logger.error('❌ Ошибка конвертации цены:', error);
      return 0;
    }
  }

  /**
   * Поиск альтернативного предмета по равной или меньшей цене
   */
  async findAlternative(withdrawal, originalItem, maxPrice) {
    try {
      logger.info(`🔄 Поиск альтернативы для ${originalItem.name}...`);

      // Ищем похожие предметы в той же ценовой категории
      const alternatives = await Item.findAll({
        where: {
          price: {
            [Op.lte]: maxPrice,
            [Op.gte]: maxPrice * 0.8 // В пределах 80-100% от цены
          },
          rarity: originalItem.rarity,
          id: {
            [Op.ne]: originalItem.id
          }
        },
        order: [['price', 'DESC']],
        limit: 5
      });

      if (alternatives.length > 0) {
        logger.info(`✅ Найдено ${alternatives.length} альтернатив:`);

        alternatives.forEach((alt, idx) => {
          logger.info(`   ${idx + 1}. ${alt.name} - ${alt.price}₽`);
        });

        // Здесь можно реализовать логику предложения альтернатив пользователю
        await withdrawal.update({
          status: 'waiting_confirmation',
          admin_notes: `Предмет не найден. Предложены альтернативы: ${alternatives.map(a => a.name).join(', ')}`
        });

      } else {
        logger.warn(`⚠️ Альтернативы не найдены`);

        await withdrawal.update({
          status: 'failed',
          failed_reason: 'Предмет не найден на PlayerOk по выгодной цене, альтернативы отсутствуют'
        });
      }

    } catch (error) {
      logger.error('❌ Ошибка поиска альтернатив:', error);
    }
  }

  /**
   * Остановка бота
   */
  async stop() {
    logger.info('🛑 Остановка бота...');
    this.isRunning = false;
    await this.playerokBot.close();
    logger.info('✅ Бот остановлен');
  }

  /**
   * Утилита для задержки
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Запуск бота
const bot = new PlayerOkArbitrageBot();

// Обработка сигналов завершения
process.on('SIGINT', async () => {
  logger.info('\n🛑 Получен сигнал SIGINT');
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('\n🛑 Получен сигнал SIGTERM');
  await bot.stop();
  process.exit(0);
});

// Запускаем
bot.start().catch(async (error) => {
  logger.error('❌ Фатальная ошибка:', error);
  await bot.stop();
  process.exit(1);
});
