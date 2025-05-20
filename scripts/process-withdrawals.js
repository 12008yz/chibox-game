#!/usr/bin/env node

/**
 * Скрипт для обработки заявок на вывод предметов
 * Запускается командой: node scripts/process-withdrawals.js
 */

const withdrawalService = require('../services/withdrawalService');
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
    new winston.transports.File({ filename: 'withdrawal-processor.log' })
  ],
});

// Флаг для предотвращения параллельных запусков
let isProcessing = false;

async function processWithdrawals() {
  // Проверяем, не запущен ли уже процесс обработки
  if (isProcessing) {
    logger.warn('Обработка заявок уже запущена, пропускаем текущий запуск');
    return;
  }

  // Устанавливаем флаг обработки
  isProcessing = true;

  try {
    logger.info('Запуск обработки заявок на вывод...');

    // Обработка всех ожидающих заявок
    const result = await withdrawalService.processAllPendingWithdrawals();

    if (result) {
      logger.info('Обработка заявок успешно завершена');
    } else {
      logger.warn('Обработка заявок завершена с предупреждениями');
    }
  } catch (error) {
    logger.error('Ошибка при обработке заявок:', error);
  } finally {
    // Снимаем флаг обработки
    isProcessing = false;
  }
}

// Если скрипт запускается напрямую (не импортируется как модуль)
if (require.main === module) {
  logger.info('Запуск скрипта обработки заявок на вывод предметов...');

  // Запускаем процесс обработки
  processWithdrawals().catch(error => {
    logger.error('Необработанная ошибка:', error);
    process.exit(1);
  }).finally(() => {
    // Даем логгеру время завершить запись перед выходом
    setTimeout(() => process.exit(0), 2000);
  });
}

// Экспортируем функцию, чтобы её можно было вызывать из других модулей
module.exports = processWithdrawals;
