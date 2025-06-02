#!/usr/bin/env node

/**
 * Улучшенный скрипт для обработки заявок на вывод предметов
 * Запускается как cron-задача по расписанию
 *
 * Добавлены:
 * - Проверка конфигураций перед запуском
 * - Отправка уведомлений об ошибках
 * - Блокировка одновременного запуска нескольких экземпляров
 * - Расширенное логирование
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const secrets = require('../config/secrets');
const db = require('../models');

// Путь к lock файлу для предотвращения параллельных запусков
const lockFilePath = path.join(__dirname, '../logs/withdrawal-processor.lock');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/withdrawal-processor.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
});

// Убеждаемся, что директория для логов существует
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Функция для проверки, запущен ли уже процесс
function isProcessRunning() {
  if (fs.existsSync(lockFilePath)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockFilePath, 'utf8'));
      const pid = lockData.pid;
      const startTime = new Date(lockData.startTime);
      const now = new Date();

      // Проверяем, не завис ли процесс (больше 1 часа работы)
      if ((now - startTime) > 60 * 60 * 1000) {
        logger.warn(`Обнаружен зависший lock-файл, создан более 1 часа назад (${startTime.toISOString()}). Удаляем его.`);
        fs.unlinkSync(lockFilePath);
        return false;
      }

      // Проверяем, существует ли еще процесс
      try {
        // Команда для проверки существования процесса
        if (process.platform === 'win32') {
          execSync(`tasklist /FI "PID eq ${pid}" | find "${pid}"`);
        } else {
          execSync(`ps -p ${pid} -o pid=`);
        }
        logger.warn(`Обработчик уже запущен с PID ${pid}. Завершаем текущий запуск.`);
        return true;
      } catch (e) {
        // Процесс не найден, удаляем устаревший lock-файл
        logger.warn(`Обнаружен устаревший lock-файл от несуществующего процесса ${pid}. Удаляем его.`);
        fs.unlinkSync(lockFilePath);
        return false;
      }
    } catch (error) {
      // Ошибка при чтении lock-файла, вероятно он поврежден
      logger.warn(`Ошибка при чтении lock-файла: ${error.message}. Удаляем его.`);
      fs.unlinkSync(lockFilePath);
      return false;
    }
  }

  return false;
}

// Функция для создания lock-файла
function createLockFile() {
  try {
    const lockData = {
      pid: process.pid,
      startTime: new Date().toISOString()
    };
    fs.writeFileSync(lockFilePath, JSON.stringify(lockData));
    logger.info(`Lock-файл создан для PID ${process.pid}`);
    return true;
  } catch (error) {
    logger.error(`Ошибка при создании lock-файла: ${error.message}`);
    return false;
  }
}

// Функция для удаления lock-файла
function removeLockFile() {
  try {
    if (fs.existsSync(lockFilePath)) {
      fs.unlinkSync(lockFilePath);
      logger.info('Lock-файл удален');
    }
  } catch (error) {
    logger.error(`Ошибка при удалении lock-файла: ${error.message}`);
  }
}

// Функция для отправки уведомления в базу данных
async function sendNotification(message, type = 'error') {
  try {
    // Пока просто логируем системные уведомления
    // В будущем можно создать отдельную таблицу для системных логов
    logger.warn(`СИСТЕМНОЕ УВЕДОМЛЕНИЕ [${type.toUpperCase()}]: ${message}`);

    // Можно также отправить email администратору или в Slack/Discord
    // await notifyAdministrators(message, type);

  } catch (error) {
    logger.error(`Ошибка при отправке уведомления: ${error.message}`);
  }
}

// Функция для проверки конфигураций перед запуском
async function checkConfigurations() {
  const configStatus = secrets.checkConfigurations();

  if (!configStatus.isValid) {
    const errorMessage = `Проблемы с конфигурацией: ${configStatus.issues.join(', ')}`;
    logger.error(errorMessage);
    await sendNotification(errorMessage);
    return false;
  }

  return true;
}

// Функция для записи статистики обработки
async function recordStats(startTime, processedCount, successCount, errorCount) {
  try {
    const endTime = new Date();
    const duration = (endTime - startTime) / 1000; // в секундах

    // Запись в лог
    logger.info(`Статистика обработки заявок:
    Время начала: ${startTime.toISOString()}
    Время окончания: ${endTime.toISOString()}
    Длительность: ${duration.toFixed(2)} секунд
    Обработано заявок: ${processedCount}
    Успешно: ${successCount}
    Ошибок: ${errorCount}`);

    // Можно добавить запись статистики в базу данных
    try {
      await db.Statistics.create({
        category: 'withdrawal_processing',
        data: {
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          duration: duration,
          processed_count: processedCount,
          success_count: successCount,
          error_count: errorCount
        }
      });
    } catch (dbError) {
      logger.warn(`Не удалось записать статистику в БД: ${dbError.message}`);
    }
  } catch (error) {
    logger.error(`Ошибка при записи статистики: ${error.message}`);
  }
}

// Запуск скрипта
async function runWithdrawalProcessor() {
  let startTime = new Date();
  let processedCount = 0;
  let successCount = 0;
  let errorCount = 0;

  try {
    logger.info('Запуск обработчика заявок на вывод предметов...');

    // Проверяем, не запущен ли уже процесс
    if (isProcessRunning()) {
      logger.warn('Обработчик уже запущен. Завершаем текущий запуск.');
      return;
    }

    // Создаем lock-файл
    if (!createLockFile()) {
      logger.error('Не удалось создать lock-файл. Завершаем запуск.');
      return;
    }

    // Проверка конфигурации
    if (!await checkConfigurations()) {
      logger.error('Проверка конфигурации не пройдена. Отмена обработки заявок.');
      return;
    }

    // Загружаем сервис для работы с заявками
    const withdrawalService = require('../services/withdrawalService');

    // Получаем список ожидающих заявок для статистики
    const pendingWithdrawals = await withdrawalService.getPendingWithdrawals();
    processedCount = pendingWithdrawals.length;

    if (processedCount === 0) {
      logger.info('Нет ожидающих заявок для обработки.');
      return;
    }

    logger.info(`Начало обработки ${processedCount} заявок на вывод...`);

    // Обрабатываем все ожидающие заявки
    const result = await withdrawalService.processAllPendingWithdrawals();

    if (result.success) {
      successCount = result.successCount || 0;
      errorCount = result.failCount || 0;

      logger.info(`Обработка заявок на вывод успешно завершена. Успешно: ${successCount}, С ошибками: ${errorCount}`);

      if (errorCount > 0) {
        await sendNotification(`Завершена обработка заявок на вывод. С ошибками: ${errorCount} из ${processedCount}`, 'warning');
      }
    } else {
      errorCount = processedCount;
      logger.error('Обработка заявок завершилась с ошибками');
      await sendNotification('Обработка заявок на вывод завершилась с ошибками');
    }
  } catch (error) {
    errorCount = processedCount;
    logger.error('Критическая ошибка при обработке заявок на вывод:', error);
    await sendNotification(`Критическая ошибка при обработке заявок: ${error.message}`);
  } finally {
    // Записываем статистику
    await recordStats(startTime, processedCount, successCount, errorCount);

    // Удаляем lock-файл в любом случае
    removeLockFile();

    // Даем время для завершения асинхронных операций
    setTimeout(() => process.exit(errorCount > 0 ? 1 : 0), 2000);
  }
}

// Обработка сигналов завершения для корректного удаления lock-файла
process.on('SIGINT', () => {
  logger.info('Получен сигнал SIGINT. Завершение работы...');
  removeLockFile();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Получен сигнал SIGTERM. Завершение работы...');
  removeLockFile();
  process.exit(0);
});

// Запускаем обработчик
runWithdrawalProcessor();
