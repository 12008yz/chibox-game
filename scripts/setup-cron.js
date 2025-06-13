#!/usr/bin/env node

/**
 * Скрипт для настройки cron-задач
 * Запускается командой: node scripts/setup-cron.js
 */

const cron = require('node-cron');
const processSteamWithdrawals = require('./send-steam-withdrawals');
const winston = require('winston');
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
      filename: path.join(logsDir, 'cron-tasks.log')
    })
  ],
});

logger.info('Настройка cron-задач запущена...');

// ✅ ИСПРАВЛЕНО: Обработка выводов каждые 5 минут (более частая проверка)
// Это нужно для подстраховки, основная обработка идет через очереди
cron.schedule('*/5 * * * *', async () => {
  logger.info('Запуск проверки заявок на вывод (cron backup)...');
  try {
    await processSteamWithdrawals();
    logger.info('Проверка заявок завершена успешно');
  } catch (error) {
    logger.error('Ошибка при проверке заявок:', error);
  }
});

// ✅ ДОБАВЛЕНО: Быстрая проверка для критически важных withdrawal
cron.schedule('*/2 * * * *', async () => {
  logger.info('Быстрая проверка critical withdrawal...');
  try {
    // Проверяем только высокоприоритетные или старые заявки
    const { Withdrawal } = require('../models');
    const urgentWithdrawals = await Withdrawal.count({
      where: {
        status: ['pending', 'direct_trade_sent'],
        created_at: {
          [require('sequelize').Op.lt]: new Date(Date.now() - 10 * 60 * 1000) // старше 10 минут
        }
      }
    });

    if (urgentWithdrawals > 0) {
      logger.info(`Найдено ${urgentWithdrawals} срочных withdrawal, запускаем обработку...`);
      await processSteamWithdrawals();
    }
  } catch (error) {
    logger.error('Ошибка при быстрой проверке:', error);
  }
});

// Запуск обработки выводов каждые 15 минут (увеличен интервал для оптимизации)
cron.schedule('*/15 * * * *', async () => {
  logger.info('Запуск обработки заявок на вывод...');
  try {
    await processSteamWithdrawals();
    logger.info('Обработка заявок завершена успешно');
  } catch (error) {
    logger.error('Ошибка при обработке заявок:', error);
  }
});

// TODO: Добавить event-driven обработку для срочных выводов

// Проверка баланса на LIS-Skins каждый час
cron.schedule('0 * * * *', async () => {
  logger.info('Запуск проверки баланса на LIS-Skins...');
  try {
    const checkLisBalance = require('./check-lis-balance');
    await checkLisBalance();
    logger.info('Проверка баланса на LIS-Skins завершена');
  } catch (error) {
    logger.error('Ошибка при проверке баланса на LIS-Skins:', error);
  }
});

// Еженедельный импорт предметов с LIS-Skins (каждый понедельник в 3:00)
cron.schedule('0 3 * * 1', async () => {
  logger.info('Запуск еженедельного импорта предметов с LIS-Skins...');
  try {
    const importLisItems = require('./import-lis-items-improved');
    // Ограничиваем количество предметов для одного запуска
    await importLisItems({
      maxItems: 5000,          // Не более 5000 предметов за раз
      delay: 1500,             // 1.5 секунды между запросами
      importStickers: false,   // Не импортировать стикеры
      importStatTrak: true     // Импортировать StatTrak предметы
    });
    logger.info('Еженедельный импорт предметов с LIS-Skins завершен');
  } catch (error) {
    logger.error('Ошибка при импорте предметов с LIS-Skins:', error);
  }
});

logger.info('Задачи cron настроены и запущены');
console.log('Задачи cron настроены и запущены');

// Экспортируем функцию для возможности импорта в другие модули
module.exports = {
  logger
};
