#!/usr/bin/env node

/**
 * Скрипт для обработки заявок на вывод предметов
 * Запускается как cron-задача по расписанию
 */

const winston = require('winston');
const path = require('path');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/withdrawal-processor.log')
    })
  ],
});

// Убеждаемся, что директория для логов существует
const fs = require('fs');
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Запуск скрипта
async function runWithdrawalProcessor() {
  try {
    logger.info('Запуск обработчика заявок на вывод предметов...');

    // Загружаем сервис для работы с заявками
    const withdrawalService = require('../services/withdrawalService');

    // Обрабатываем все ожидающие заявки
    await withdrawalService.processAllPendingWithdrawals();

    logger.info('Обработка заявок на вывод успешно завершена');
    process.exit(0);
  } catch (error) {
    logger.error('Ошибка при обработке заявок на вывод:', error);
    process.exit(1);
  }
}

// Запускаем обработчик
runWithdrawalProcessor();
