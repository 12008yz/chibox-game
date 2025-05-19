#!/usr/bin/env node

/**
 * Скрипт для установки cron-задач
 * Запускается командой: node scripts/setup-cron.js
 */

const cron = require('node-cron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const config = require('../config/config');

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
      filename: path.join(__dirname, '../logs/cron.log')
    })
  ],
});

// Убеждаемся, что директория для логов существует
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

logger.info('Запуск установки cron-задач...');

// Функция для запуска процесса
function runProcess(scriptPath) {
  // Получаем абсолютный путь к скрипту
  const absolutePath = path.join(__dirname, scriptPath);

  logger.info(`Запуск скрипта: ${absolutePath}`);

  // Запускаем процесс
  const process = spawn('node', [absolutePath], {
    stdio: 'inherit',
    detached: true,
    cwd: path.join(__dirname, '..')
  });

  // Обработка ошибок
  process.on('error', (error) => {
    logger.error(`Ошибка запуска процесса ${scriptPath}:`, error);
  });

  // Обработка завершения процесса
  process.on('exit', (code) => {
    if (code !== 0) {
      logger.error(`Процесс ${scriptPath} завершился с кодом ${code}`);
    } else {
      logger.info(`Процесс ${scriptPath} успешно завершен`);
    }
  });
}

// Устанавливаем задачу для обработки заявок на вывод
if (config.cron && config.cron.withdrawalProcessor) {
  logger.info(`Настройка обработчика заявок на вывод с расписанием: ${config.cron.withdrawalProcessor}`);

  cron.schedule(config.cron.withdrawalProcessor, () => {
    logger.info('Запуск обработчика заявок на вывод по расписанию...');
    runProcess('withdrawalProcessor.js');
  }, {
    scheduled: true,
    timezone: 'Europe/Moscow' // Настройте под свой часовой пояс
  });

  logger.info('Задача по обработке заявок на вывод успешно настроена');
} else {
  logger.warn('Расписание для обработчика заявок на вывод не настроено');
}

logger.info('Установка cron-задач завершена');

// Оставляем процесс работающим для выполнения задач
logger.info('Процесс cron работает...');
console.log('Нажмите Ctrl+C для завершения процесса');

// Добавляем обработчики для корректного завершения процесса
process.on('SIGINT', () => {
  logger.info('Получен сигнал прерывания. Завершение работы...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Получен сигнал завершения. Завершение работы...');
  process.exit(0);
});
