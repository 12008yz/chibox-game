#!/usr/bin/env node

/**
 * Тестовый скрипт для проверки обновленного CSMoneyService с новым API
 * Запускается командой: node scripts/test-updated-csmoney-service.js
 */

const CSMoneyService = require('../services/csmoneyService');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Логгер
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ],
});

// Основная функция для тестирования
async function testUpdatedCSMoneyService() {
  logger.info('Тестирование обновленного CSMoneyService с новым API...');

  try {
    // Загружаем конфигурацию
    const csmoneyConfig = CSMoneyService.loadConfig();
    const csmoneyService = new CSMoneyService(csmoneyConfig);

    // Инициализируем сервис
    logger.info('Инициализация сервиса CS.Money...');
    await csmoneyService.initialize();

    logger.info('Статус авторизации:', csmoneyService.isLoggedIn ? 'Авторизован' : 'Не авторизован');

    // Тест 1: Получение предметов
    logger.info('Тест 1: Получение предметов...');
    const itemsResult = await csmoneyService.getItems(0, 10);

    if (!itemsResult.success) {
      logger.error(`Тест 1 ПРОВАЛЕН: ${itemsResult.message}`);
      return false;
    }

    logger.info(`Тест 1 УСПЕШНО: Получено ${itemsResult.items.length} предметов`);

    // Выводим пример первого предмета для проверки структуры
    if (itemsResult.items.length > 0) {
      logger.info('Пример предмета:');
      console.log(JSON.stringify(itemsResult.items[0], null, 2));

      // Проверяем обязательные поля
      const item = itemsResult.items[0];
      if (!item.id || !item.name || item.price === undefined) {
        logger.error('Тест 1 ПРОВАЛЕН: Некорректная структура предмета');
        console.log('Отсутствуют обязательные поля: id, name или price');
        return false;
      }
    }

    // Тест 2: Поиск предмета
    if (itemsResult.items.length > 0) {
      const testItem = itemsResult.items[0];
      logger.info(`Тест 2: Поиск предмета "${testItem.name}"...`);

      const searchResult = await csmoneyService.searchItem(testItem.name);

      if (!searchResult.success) {
        logger.error(`Тест 2 ПРОВАЛЕН: ${searchResult.message}`);
      } else {
        logger.info(`Тест 2 УСПЕШНО: Найден предмет "${searchResult.market_hash_name}"`);
        console.log('Результат поиска:', JSON.stringify(searchResult.items[0], null, 2));
      }
    } else {
      logger.warn('Тест 2 ПРОПУЩЕН: Нет предметов для поиска');
    }

    // Закрываем сервис
    await csmoneyService.close();

    return true;
  } catch (error) {
    logger.error('Ошибка при тестировании:', error);
    return false;
  }
}

// Запускаем тестирование
testUpdatedCSMoneyService()
  .then(success => {
    if (success) {
      console.log('✓ Тестирование обновленного сервиса CS.Money прошло успешно');
      console.log('✓ Сервис готов к использованию с новым API');
    } else {
      console.log('✗ Тестирование обновленного сервиса CS.Money не удалось');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('Необработанная ошибка при тестировании:', error);
    process.exit(1);
  });
