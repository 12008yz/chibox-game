#!/usr/bin/env node

/**
 * Скрипт для отправки withdrawal предметов из Steam инвентаря бота
 * НЕ покупает предметы, только отправляет те что уже есть в инвентаре
 */

const { Withdrawal, User, UserInventory, Item } = require('../models');
const SteamBot = require('../services/steamBotService');
const steamBotConfig = require('../config/steam_bot.js');
const winston = require('winston');

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
    new winston.transports.Console()
  ],
});

// Инициализируем Steam бота
const steamBot = new SteamBot(
  steamBotConfig.accountName,
  steamBotConfig.password,
  steamBotConfig.sharedSecret,
  steamBotConfig.identitySecret,
  steamBotConfig.steamApiKey
);

async function processPendingWithdrawals() {
  try {
    logger.info('🚀 Запуск обработки withdrawal без покупки предметов...');

    // Авторизуем бота
    logger.info('🔐 Авторизация Steam бота...');
    await steamBot.login();
    logger.info('✅ Steam бот авторизован');

    // Находим все pending и direct_trade_sent withdrawal
    const withdrawals = await Withdrawal.findAll({
      where: {
        status: ['pending', 'direct_trade_sent']
      },
      attributes: ['id', 'user_id', 'status', 'steam_trade_url', 'tracking_data', 'created_at', 'updated_at'],
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
              attributes: ['id', 'name', 'steam_market_hash_name', 'exterior']
            }
          ]
        }
      ]
    });

    if (withdrawals.length === 0) {
      logger.info('📝 Нет pending withdrawal для обработки');
      return;
    }

    logger.info(`📋 Найдено ${withdrawals.length} withdrawal для обработки`);

    // Получаем инвентарь бота
    logger.info('📦 Загружаем инвентарь Steam бота...');
    let botInventory = null;
    try {
      botInventory = await steamBot.getInventory(730, 2, true);
      logger.info(`📦 В инвентаре бота ${botInventory.length} предметов`);
    } catch (inventoryError) {
      if (inventoryError.message.includes('duplicate')) {
        logger.warn('⚠️ Ошибка дубликата при загрузке инвентаря. Будем искать предметы по мере необходимости...');
        botInventory = null; // Будем искать предметы индивидуально
      } else {
        throw inventoryError;
      }
    }

    let successCount = 0;
    let errorCount = 0;

    for (const withdrawal of withdrawals) {
      try {
        logger.info(`🎯 Обработка withdrawal #${withdrawal.id} (статус: ${withdrawal.status})`);

        // Если withdrawal уже отправлен, проверяем статус трейда
        if (withdrawal.status === 'direct_trade_sent') {
          if (withdrawal.tracking_data?.trade_offer_id) {
            logger.info(`🔍 Проверка статуса уже отправленного трейда #${withdrawal.tracking_data.trade_offer_id}`);

            try {
              const confirmResult = await steamBot.confirmTradeOffer(withdrawal.tracking_data.trade_offer_id);
              if (confirmResult.success) {
                logger.info(`✅ Трейд #${withdrawal.tracking_data.trade_offer_id} подтвержден!`);
                await updateWithdrawalStatus(withdrawal, 'completed', 'Трейд подтвержден и завершен');
                successCount++;
              } else {
                logger.info(`⏳ Трейд #${withdrawal.tracking_data.trade_offer_id} еще ожидает подтверждения`);
              }
            } catch (error) {
              logger.warn(`⚠️ Ошибка проверки трейда: ${error.message}`);
            }
          }
          continue; // Переходим к следующему withdrawal
        }

        // Проверяем trade URL (берем из withdrawal, а не из user)
        const tradeUrl = withdrawal.steam_trade_url || withdrawal.user.steam_trade_url;
        if (!tradeUrl) {
          logger.error(`❌ У withdrawal #${withdrawal.id} нет trade URL`);
          await updateWithdrawalStatus(withdrawal, 'failed', 'Отсутствует trade URL');
          errorCount++;
          continue;
        }

        // Ищем предметы в инвентаре бота
        const itemsToSend = [];
        const missingItems = [];

        for (const userItem of withdrawal.items) {
          const item = userItem.item;
          const marketHashName = item.steam_market_hash_name || item.name;

          let botItem = null;

          // Ищем предмет в инвентаре бота
          if (botInventory) {
            // Если инвентарь загружен, ищем в нем
            botItem = botInventory.find(botInvItem => {
              return botInvItem.market_hash_name === marketHashName;
            });
          } else {
            // Если инвентарь не загружен, ищем индивидуально
            try {
              logger.info(`🔍 Поиск предмета в инвентаре: ${marketHashName}`);
              botItem = await steamBot.findItemInInventory(marketHashName, item.exterior);
            } catch (findError) {
              logger.warn(`⚠️ Ошибка поиска предмета ${marketHashName}: ${findError.message}`);
            }
          }

          if (botItem) {
            itemsToSend.push(botItem);
            logger.info(`✅ Найден предмет: ${marketHashName} (${botItem.assetid || botItem.id})`);
          } else {
            missingItems.push(marketHashName);
            logger.warn(`⚠️ Предмет не найден в инвентаре: ${marketHashName}`);
          }
        }

        if (missingItems.length > 0) {
          const message = `Предметы не найдены в инвентаре: ${missingItems.join(', ')}`;
          logger.error(`❌ ${message}`);
          await updateWithdrawalStatus(withdrawal, 'failed', message);
          errorCount++;
          continue;
        }

        if (itemsToSend.length === 0) {
          logger.error(`❌ Нет предметов для отправки в withdrawal #${withdrawal.id}`);
          await updateWithdrawalStatus(withdrawal, 'failed', 'Нет предметов для отправки');
          errorCount++;
          continue;
        }

        // Обновляем статус на processing
        await updateWithdrawalStatus(withdrawal, 'processing', 'Отправка trade offer');

        // Отправляем trade offer
        logger.info(`📤 Отправка trade offer пользователю ${withdrawal.user.username}...`);
        logger.info(`📤 Trade URL: ${tradeUrl.substring(0, 50)}...`);
        const tradeResult = await steamBot.sendTrade(tradeUrl, itemsToSend.map(item => item.assetid || item.id), botInventory);

        if (tradeResult.success) {
          logger.info(`✅ Trade offer отправлен! ID: ${tradeResult.tradeOfferId}`);

          // Ждем немного и пытаемся подтвердить трейд
          logger.info(`🔄 Попытка подтверждения трейда #${tradeResult.tradeOfferId}...`);
          await delay(3000); // Ждем 3 секунды

          try {
            const confirmResult = await steamBot.confirmTradeOffer(tradeResult.tradeOfferId);
            if (confirmResult.success) {
              logger.info(`✅ Трейд #${tradeResult.tradeOfferId} подтвержден автоматически!`);
            } else {
              logger.warn(`⚠️ Не удалось подтвердить трейд автоматически: ${confirmResult.message}`);
            }
          } catch (confirmError) {
            logger.warn(`⚠️ Ошибка автоподтверждения: ${confirmError.message}`);
          }

          await updateWithdrawalStatus(withdrawal, 'direct_trade_sent', `Trade offer отправлен`, {
            trade_offer_id: tradeResult.tradeOfferId,
            sent_items: itemsToSend.map(item => ({
              assetid: item.assetid,
              market_hash_name: item.market_hash_name
            }))
          });
          successCount++;
        } else {
          logger.error(`❌ Ошибка отправки trade offer: ${tradeResult.message}`);
          await updateWithdrawalStatus(withdrawal, 'failed', `Ошибка отправки: ${tradeResult.message}`);
          errorCount++;
        }

        // Задержка между withdrawal
        await delay(5000);

      } catch (error) {
        logger.error(`💥 Ошибка обработки withdrawal #${withdrawal.id}:`, error);
        await updateWithdrawalStatus(withdrawal, 'failed', `Системная ошибка: ${error.message}`);
        errorCount++;
      }
    }

    logger.info(`🏁 Обработка завершена! Успешно: ${successCount}, Ошибок: ${errorCount}`);

  } catch (error) {
    logger.error('💥 Критическая ошибка:', error);
    process.exit(1);
  }

  process.exit(0);
}

async function updateWithdrawalStatus(withdrawal, status, message, additionalData = {}) {
  await withdrawal.update({
    status,
    tracking_data: {
      ...withdrawal.tracking_data,
      last_update: new Date().toISOString(),
      message,
      ...additionalData
    }
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Запуск скрипта
if (require.main === module) {
  processPendingWithdrawals();
}

module.exports = processPendingWithdrawals;
