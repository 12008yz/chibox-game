#!/usr/bin/env node

/**
 * Тест для проверки конфигурации BUFF
 * Запускается командой: node scripts/test-buff-config.js
 */

const BuffService = require('../services/buffService');
const winston = require('winston');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

async function testBuffConfig() {
  logger.info('Начало тестирования конфигурации BUFF...');

  try {
    // Загрузка конфигурации
    const buffConfig = BuffService.loadConfig();
    logger.info('Конфигурация BUFF загружена');

    // Информация о конфигурации (без отображения полных куки для безопасности)
    logger.info(`Дата последнего обновления: ${buffConfig.lastUpdated}`);
    logger.info(`Длина строки cookies: ${buffConfig.cookies ? buffConfig.cookies.length : 0} символов`);
    logger.info(`CSRF Token установлен: ${!!buffConfig.csrfToken}`);
    logger.info(`Session ID установлен: ${!!buffConfig.sessionId}`);

    // Создание экземпляра сервиса
    const buffService = new BuffService(buffConfig);

    // Инициализация и проверка авторизации
    logger.info('Инициализация сервиса BUFF...');
    await buffService.initialize();

    if (buffService.isLoggedIn) {
      logger.info('✅ Успешная авторизация на BUFF!');

      // Тестовый запрос - получение инвентаря BUFF
      logger.info('Запрос инвентаря BUFF...');
      const inventory = await buffService.getBuffInventory();

      if (inventory.success) {
        logger.info(`✅ Получено ${inventory.items.length} предметов из инвентаря BUFF`);

        // Выводим информацию о первых 3 предметах (если они есть)
        if (inventory.items.length > 0) {
          logger.info('Первые предметы в инвентаре:');
          inventory.items.slice(0, 3).forEach((item, index) => {
            logger.info(`${index + 1}. ${item.market_hash_name || item.name} (ID: ${item.id || item.assetid})`);
          });
        }

        // Тестовый поиск предмета
        logger.info('Тестовый поиск предмета на BUFF...');
        const testItem = await buffService.searchItem('AK-47 | Redline', 'Field-Tested');

        if (testItem) {
          logger.info(`✅ Предмет найден: ${testItem.market_hash_name} (ID: ${testItem.id})`);
          if (testItem.lowest_price) {
            logger.info(`Минимальная цена: ${testItem.lowest_price}`);
          }
          if (testItem.sell_num) {
            logger.info(`Количество доступных предложений: ${testItem.sell_num}`);
          }
        } else {
          logger.warn('❌ Тестовый предмет не найден');
        }
      } else {
        logger.error(`❌ Ошибка получения инвентаря: ${inventory.message}`);
      }
    } else {
      logger.error('❌ Ошибка авторизации на BUFF, проверьте cookies и CSRF token');
    }

    // Закрытие браузера
    logger.info('Закрытие сессии BUFF...');
    await buffService.close();
    logger.info('Тестирование завершено');
  } catch (error) {
    logger.error('❌ Ошибка при тестировании конфигурации BUFF:', error);
  }
}

// Запускаем тест
testBuffConfig().catch(error => {
  logger.error('Необработанная ошибка:', error);
  process.exit(1);
}).finally(() => {
  // Даем логгеру время завершить запись
  setTimeout(() => process.exit(0), 1000);
});
