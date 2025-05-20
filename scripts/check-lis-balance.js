#!/usr/bin/env node

/**
 * Скрипт для проверки баланса на LIS-Skins
 * Запускается командой: node scripts/check-lis-balance.js
 */

const LisService = require('../services/lisService');
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

async function checkLisBalance() {
  logger.info('Проверка баланса на LIS-Skins...');

  const lisConfig = LisService.loadConfig();
  const lisService = new LisService(lisConfig);

  try {
    // Инициализация сервиса
    logger.info('Инициализация сервиса LIS-Skins...');
    await lisService.initialize();

    if (!lisService.isLoggedIn) {
      logger.error('Ошибка авторизации на LIS-Skins. Проверьте cookies и CSRF-токен.');
      return;
    }

    // Получение баланса
    logger.info('Запрос баланса пользователя...');
    const balanceResult = await lisService.getBalance();

    if (balanceResult.success) {
      logger.info(`Текущий баланс на LIS-Skins: ${balanceResult.balance}`);
      console.log('\x1b[32m%s\x1b[0m', `Баланс LIS-Skins: ${balanceResult.balance}`);
    } else {
      logger.error(`Ошибка получения баланса: ${balanceResult.message}`);
      console.log('\x1b[31m%s\x1b[0m', `Ошибка получения баланса: ${balanceResult.message}`);
    }
  } catch (error) {
    logger.error('Ошибка при проверке баланса:', error);
    console.log('\x1b[31m%s\x1b[0m', `Ошибка при проверке баланса: ${error.message}`);
  } finally {
    // Закрываем сервис
    logger.info('Закрытие сервиса LIS-Skins...');
    await lisService.close();
  }
}

// Запускаем проверку баланса
checkLisBalance().catch(error => {
  logger.error('Необработанная ошибка:', error);
  console.log('\x1b[31m%s\x1b[0m', `Необработанная ошибка: ${error.message}`);
  process.exit(1);
}).finally(() => {
  // Даем логгеру время завершить запись
  setTimeout(() => process.exit(0), 1000);
});
