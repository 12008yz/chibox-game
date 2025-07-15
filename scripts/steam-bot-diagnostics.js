#!/usr/bin/env node

/**
 * Диагностический скрипт для проверки состояния Steam бота
 * Помогает выявить проблемы с авторизацией, торговлей и API
 */

// Загружаем переменные окружения из .env файла
require('dotenv').config();

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

async function runDiagnostics() {
  try {
    logger.info('🔍 Запуск диагностики Steam бота...');

    // 1. Проверка конфигурации
    logger.info('📋 Проверка конфигурации...');

    if (!steamBotConfig.accountName) {
      logger.error('❌ Отсутствует STEAM_ACCOUNT_NAME');
      return;
    }

    if (!steamBotConfig.password) {
      logger.error('❌ Отсутствует STEAM_PASSWORD');
      return;
    }

    if (!steamBotConfig.sharedSecret) {
      logger.error('❌ Отсутствует STEAM_SHARED_SECRET');
      return;
    }

    if (!steamBotConfig.identitySecret) {
      logger.error('❌ Отсутствует STEAM_IDENTITY_SECRET');
      return;
    }

    logger.info('✅ Конфигурация базовая проверена');

    // 2. Проверка авторизации
    logger.info('🔐 Тестирование авторизации...');

    try {
      await steamBot.login();
      logger.info('✅ Авторизация прошла успешно');
    } catch (loginError) {
      logger.error(`❌ Ошибка авторизации: ${loginError.message}`);
      return;
    }

    // 3. Получение информации о профиле
    logger.info('👤 Получение информации о профиле бота...');

    try {
      const profileInfo = await steamBot.getProfileInfo();
      logger.info(`✅ Профиль бота: ${JSON.stringify(profileInfo, null, 2)}`);

      if (!profileInfo.loggedIn) {
        logger.warn('⚠️ Бот показывает что не авторизован');
      }

      if (profileInfo.wallet && profileInfo.wallet.balance) {
        logger.info(`💰 Баланс Steam кошелька: ${profileInfo.wallet.balance} ${profileInfo.wallet.currency === 37 ? 'RUB' : 'USD'}`);
      }

    } catch (profileError) {
      logger.error(`❌ Ошибка получения профиля: ${profileError.message}`);
    }

    // 4. Проверка торговых ограничений
    logger.info('🛡️ Проверка торговых ограничений...');

    try {
      const restrictions = await steamBot.getTradeRestrictions();
      logger.info(`📊 Ограничения: ${JSON.stringify(restrictions, null, 2)}`);

      if (!restrictions.canTrade) {
        logger.error('❌ У бота есть ограничения на торговлю!');
        logger.info('💡 Возможные причины:');
        logger.info('   - Steam Guard активен менее 7 дней');
        logger.info('   - Недавняя смена пароля или устройства');
        logger.info('   - Ограничения от Steam Support');
        return;
      }

      if (restrictions.tradeHold) {
        logger.warn('⚠️ У бота активен trade hold');
      }

      logger.info('✅ Торговые ограничения в порядке');

    } catch (restrictionError) {
      logger.error(`❌ Ошибка проверки ограничений: ${restrictionError.message}`);
    }

    // 5. Проверка инвентаря
    logger.info('📦 Проверка инвентаря...');

    try {
      const inventory = await steamBot.getInventory(730, 2, true);
      logger.info(`✅ В инвентаре найдено ${inventory.length} предметов CS2`);

      if (inventory.length > 0) {
        logger.info('📋 Первые 5 предметов:');
        inventory.slice(0, 5).forEach((item, index) => {
          logger.info(`   ${index + 1}. ${item.market_hash_name} (${item.assetid})`);
        });
      } else {
        logger.warn('⚠️ Инвентарь пуст');
      }

    } catch (inventoryError) {
      logger.error(`❌ Ошибка загрузки инвентаря: ${inventoryError.message}`);
    }

    // 6. Проверка Confirmation Checker
    logger.info('🔄 Проверка Confirmation Checker...');

    try {
      const checkerStatus = await steamBot.getConfirmationCheckerStatus();
      logger.info(`📊 Статус Confirmation Checker: ${JSON.stringify(checkerStatus, null, 2)}`);

      if (!checkerStatus.ready) {
        logger.warn('⚠️ Confirmation Checker не готов');
      } else {
        logger.info('✅ Confirmation Checker работает');
      }

    } catch (checkerError) {
      logger.error(`❌ Ошибка проверки Confirmation Checker: ${checkerError.message}`);
    }

    // 7. Тест Steam API
    logger.info('🌐 Тестирование Steam API...');

    try {
      const apiTest = await steamBot.testSteamApi();
      if (apiTest.success) {
        logger.info('✅ Steam API работает корректно');
      } else {
        logger.error(`❌ Ошибка Steam API: ${apiTest.message}`);
      }
    } catch (apiError) {
      logger.error(`❌ Ошибка тестирования API: ${apiError.message}`);
    }

    // 8. Тест создания Trade Offer
    logger.info('🔄 Тестирование создания Trade Offer...');

    try {
      // Используем собственный Steam ID для теста
      const testResult = await steamBot.testTradeOfferCreation(steamBot.client.steamID);
      if (testResult.success) {
        logger.info('✅ Создание Trade Offer работает');
      } else {
        logger.error(`❌ Ошибка создания Trade Offer: ${testResult.message}`);
      }
    } catch (testError) {
      logger.error(`❌ Ошибка тестирования Trade Offer: ${testError.message}`);
    }

    // 9. Проверка версий пакетов
    logger.info('📦 Проверка версий Steam пакетов...');

    try {
      const packageJson = require('../package.json');
      const steamPackages = [
        'steam-user',
        'steamcommunity',
        'steam-tradeoffer-manager',
        'steam-totp'
      ];

      steamPackages.forEach(pkg => {
        if (packageJson.dependencies[pkg]) {
          logger.info(`   ${pkg}: ${packageJson.dependencies[pkg]}`);
        } else {
          logger.warn(`⚠️ Пакет ${pkg} не найден в dependencies`);
        }
      });

    } catch (packageError) {
      logger.error(`❌ Ошибка проверки пакетов: ${packageError.message}`);
    }

    // 10. Финальная проверка
    logger.info('🏁 Финальная проверка состояния...');

    const finalCheck = {
      authenticated: steamBot.loggedIn,
      sessionValid: steamBot.isSessionValid(),
      managerReady: !!steamBot.manager,
      communityReady: !!steamBot.community
    };

    logger.info(`📊 Финальное состояние: ${JSON.stringify(finalCheck, null, 2)}`);

    if (finalCheck.authenticated && finalCheck.sessionValid && finalCheck.managerReady) {
      logger.info('🎉 Диагностика завершена успешно! Бот готов к работе');
    } else {
      logger.error('❌ Обнаружены проблемы с ботом');
    }

  } catch (error) {
    logger.error('💥 Критическая ошибка диагностики:', error);
  } finally {
    // Корректное завершение
    try {
      await steamBot.shutdown();
    } catch (shutdownError) {
      logger.warn('⚠️ Ошибка при завершении работы бота:', shutdownError.message);
    }
    process.exit(0);
  }
}

// Запуск диагностики
runDiagnostics();
