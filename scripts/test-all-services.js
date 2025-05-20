#!/usr/bin/env node

/**
 * Скрипт для тестирования всех сервисов системы
 * Запускается командой: node scripts/test-all-services.js
 */

const winston = require('winston');
const SteamBot = require('../services/steamBotService');
const LisService = require('../services/lisService');
const steamBotConfig = require('../config/steam_bot');
const path = require('path');
const fs = require('fs');

// Создаем директорию для логов, если её нет
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Логгер
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logsDir, 'test-services.log')
    })
  ],
});

async function testAllServices() {
  logger.info('======= Начало тестирования всех сервисов =======');

  // Тестирование Steam бота
  logger.info('--- Тестирование Steam бота ---');
  const steamBot = new SteamBot(
    steamBotConfig.accountName,
    steamBotConfig.password,
    steamBotConfig.sharedSecret,
    steamBotConfig.identitySecret
  );

  try {
    logger.info('Авторизация в Steam...');
    await steamBot.login();
    logger.info('✅ Авторизация в Steam успешна');

    logger.info('Получение инвентаря Steam...');
    const inventory = await steamBot.getInventory(730, 2);
    logger.info(`✅ Инвентарь Steam получен. Количество предметов: ${inventory.length}`);

    // Выводим информацию о первых 5 предметах
    if (inventory.length > 0) {
      logger.info('Примеры предметов в инвентаре:');
      inventory.slice(0, 5).forEach((item, index) => {
        logger.info(`${index + 1}. ${item.market_hash_name || item.name} (${item.assetid})`);
      });
    }
  } catch (error) {
    logger.error('❌ Ошибка при тестировании Steam бота:', error);
  } finally {
    try {
      logger.info('Завершение работы Steam бота...');
      await steamBot.shutdown();
      logger.info('✅ Работа Steam бота завершена');
    } catch (shutdownError) {
      logger.error('❌ Ошибка при завершении работы Steam бота:', shutdownError);
    }
  }

  // Тестирование LIS-Skins
  logger.info('--- Тестирование LIS-Skins ---');
  try {
    const lisConfig = LisService.loadConfig();
    const lisService = new LisService(lisConfig);

    logger.info('Инициализация LIS-Skins сервиса...');
    await lisService.initialize();

    if (lisService.isLoggedIn) {
      logger.info('✅ Авторизация в LIS-Skins успешна');

      logger.info('Получение баланса LIS-Skins...');
      const balance = await lisService.getBalance();

      if (balance.success) {
        logger.info(`✅ Баланс на LIS-Skins: ${balance.balance}`);
      } else {
        logger.error(`❌ Ошибка получения баланса: ${balance.message}`);
      }

      // Тестовый поиск предмета
      logger.info('Тестовый поиск предмета на LIS-Skins...');
      const testItem = await lisService.searchItem('AK-47 | Redline', 'Field-Tested');

      if (testItem) {
        logger.info(`✅ Предмет найден: ${testItem.market_hash_name}`);
        if (testItem.min_price) {
          logger.info(`Минимальная цена: ${testItem.min_price}`);
        }
        if (testItem.items && testItem.items.length) {
          logger.info(`Количество доступных предложений: ${testItem.items.length}`);
        }
      } else {
        logger.warn('❌ Тестовый предмет не найден');
      }
    } else {
      logger.error('❌ Ошибка авторизации в LIS-Skins. Проверьте настройки в config/lis_config.json');
    }

    // Закрытие LIS-Skins
    logger.info('Закрытие LIS-Skins сервиса...');
    await lisService.close();
    logger.info('✅ Сервис LIS-Skins закрыт');
  } catch (error) {
    logger.error('❌ Ошибка при тестировании LIS-Skins:', error);
  }

  logger.info('======= Тестирование сервисов завершено =======');
}

// Запуск тестирования
testAllServices().catch(error => {
  logger.error('Необработанная ошибка:', error);
  process.exit(1);
}).finally(() => {
  // Даем логгеру время завершить запись
  setTimeout(() => process.exit(0), 1000);
});
