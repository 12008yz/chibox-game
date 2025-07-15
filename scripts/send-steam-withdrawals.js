#!/usr/bin/env node

/**
 * Скрипт для отправки withdrawal предметов из Steam инвентаря бота
 * НЕ покупает предметы, только отправляет те что уже есть в инвентаре
 */

// Загружаем переменные окружения из .env файла
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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

    // Проверяем состояние самого бота
    logger.info('🔍 Проверка состояния аккаунта бота...');
    const botProfile = await steamBot.getProfileInfo();
    logger.info(`📊 Бот профиль: ${JSON.stringify(botProfile, null, 2)}`);

    const botRestrictions = await steamBot.getTradeRestrictions();
    logger.info(`📊 Ограничения бота: ${JSON.stringify(botRestrictions, null, 2)}`);

    if (botRestrictions.error || !botRestrictions.canTrade) {
      logger.error('❌ У аккаунта бота есть ограничения на торговлю!');
      logger.error('💡 Возможные решения:');
      logger.error('   - Проверьте что Steam Guard активен более 7 дней');
      logger.error('   - Убедитесь что аккаунт не имеет trade hold');
      logger.error('   - Проверьте что аккаунт не ограничен Steam');
      return;
    }

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

        // Валидируем Trade URL
        const tradeUrlPattern = /^https:\/\/steamcommunity\.com\/tradeoffer\/new\/\?partner=\d+&token=[a-zA-Z0-9_-]+$/;
        if (!tradeUrlPattern.test(tradeUrl)) {
          logger.error(`❌ Некорректный Trade URL для withdrawal #${withdrawal.id}: ${tradeUrl}`);
          await updateWithdrawalStatus(withdrawal, 'failed', 'Некорректный формат Trade URL');
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

        // Валидируем Trade URL с улучшенными проверками
        logger.info(`🔍 Валидация Trade URL...`);
        const urlValidation = await steamBot.validateTradeUrl(tradeUrl);

        if (!urlValidation.valid) {
          logger.error(`❌ Некорректный Trade URL: ${urlValidation.error}`);
          await updateWithdrawalStatus(withdrawal, 'failed', `Trade URL невалиден: ${urlValidation.error}`);
          errorCount++;
          continue;
        }

        const { partnerId, token, partnerSteamId } = urlValidation;
        logger.info(`🔍 Partner ID: ${partnerId}, Token: ${token.substring(0, 8)}..., SteamID64: ${partnerSteamId}`);

        // Проверяем профиль получателя
        logger.info(`👤 Проверка профиля получателя...`);
        const profileCheck = await steamBot.checkPartnerProfile(partnerSteamId);

        if (!profileCheck.accessible) {
          logger.warn(`⚠️ Профиль получателя недоступен для API: ${profileCheck.error}`);
          logger.info(`🔄 Но пробуем отправить трейд все равно (иногда API профилей работает нестабильно)...`);
          // Не прерываем выполнение, продолжаем отправку трейда
        } else {
          if (!profileCheck.canTrade) {
            logger.error(`❌ У получателя ограничения на торговлю`);
            await updateWithdrawalStatus(withdrawal, 'failed', 'У вашего Steam аккаунта есть ограничения на торговлю. Убедитесь что профиль публичный и торговля разрешена');
            errorCount++;
            continue;
          }

          if (profileCheck.vacBanned || profileCheck.communityBanned) {
            logger.error(`❌ Получатель имеет баны: VAC: ${profileCheck.vacBanned}, Community: ${profileCheck.communityBanned}`);
            await updateWithdrawalStatus(withdrawal, 'failed', 'Ваш Steam аккаунт имеет активные баны');
            errorCount++;
            continue;
          }

          logger.info(`✅ Профиль получателя проверен: ${profileCheck.profileName || 'Unknown'}`);
        }

        // Дополнительная диагностика перед отправкой
        logger.info(`📤 Отправка trade offer пользователю ${withdrawal.user.username}...`);
        logger.info(`📤 Trade URL: ${tradeUrl}`);

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

          // Улучшенные сообщения об ошибках для пользователя
          let userMessage = `Ошибка отправки: ${tradeResult.message}`;

          if (tradeResult.eresult === 15 || tradeResult.message.includes('15')) {
            userMessage = '❌ Trade URL устарел или недействителен.\n\n' +
                         '🔧 Как исправить:\n' +
                         '1. Откройте Steam → Профиль → Изменить профиль\n' +
                         '2. Перейдите в "Настройки торговли"\n' +
                         '3. Нажмите "Создать новую URL для торговых предложений"\n' +
                         '4. Скопируйте новый Trade URL на сайт\n' +
                         '5. Попробуйте вывод снова';
          } else if (tradeResult.eresult === 20 || tradeResult.message.includes('20')) {
            userMessage = '❌ Профиль Steam недоступен или ограничен.\n\n' +
                         '🔧 Как исправить:\n' +
                         '1. Убедитесь что ваш профиль Steam публичный\n' +
                         '2. Проверьте настройки приватности в Steam\n' +
                         '3. Убедитесь что торговля разрешена в настройках\n' +
                         '4. Попробуйте обновить Trade URL';
          } else if (tradeResult.eresult === 25 || tradeResult.message.includes('25')) {
            userMessage = '❌ У вашего Steam аккаунта есть ограничения на торговлю.\n\n' +
                         '🔧 Возможные причины:\n' +
                         '1. Steam Guard активен менее 7 дней\n' +
                         '2. Недавняя смена пароля или email\n' +
                         '3. Ограничения Steam на аккаунт\n' +
                         '4. Необходимо подтверждение через мобильное приложение';
          } else if (tradeResult.message.includes('There was an error sending')) {
            userMessage = '❌ Ошибка Steam API. Попробуйте:\n\n' +
                         '🔧 Решение:\n' +
                         '1. Подождите 5-10 минут\n' +
                         '2. Создайте новый Trade URL в Steam\n' +
                         '3. Убедитесь что профиль Steam публичный\n' +
                         '4. Попробуйте вывод снова';
          } else if (tradeResult.message.includes('partner')) {
            userMessage = '❌ Проблема с Trade URL.\n\n' +
                         '🔧 Решение:\n' +
                         '1. Проверьте корректность Trade URL\n' +
                         '2. Создайте новый Trade URL в Steam\n' +
                         '3. Убедитесь что URL скопирован полностью';
          }

          await updateWithdrawalStatus(withdrawal, 'failed', userMessage);
          errorCount++;
        }

        // Задержка между withdrawal (увеличена для избежания rate limiting)
        await delay(10000);

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
