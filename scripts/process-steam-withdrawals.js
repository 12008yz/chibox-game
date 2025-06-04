#!/usr/bin/env node

/**
 * Новый процессор заявок на вывод через Steam Market
 * Заменяет старый CS.Money подход
 */

const SteamWithdrawalService = require('../services/steamWithdrawalService');
const winston = require('winston');
const fs = require('fs');
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
    new winston.transports.File({ filename: 'steam-withdrawal-processor.log' })
  ],
});

// Lock файл для предотвращения параллельных запусков
const LOCK_FILE = path.join(__dirname, '../.lock-steam-withdrawals');

class SteamWithdrawalProcessor {
  constructor() {
    this.withdrawalService = new SteamWithdrawalService();
    this.isProcessing = false;
    this.startTime = null;
  }

  /**
   * Проверка lock файла
   */
  checkLockFile() {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = fs.readFileSync(LOCK_FILE, 'utf8');
      const lockTime = new Date(lockData);
      const now = new Date();

      // Если lock файл старше 30 минут - удаляем его
      if (now - lockTime > 30 * 60 * 1000) {
        logger.warn('Удаляем устаревший lock файл');
        fs.unlinkSync(LOCK_FILE);
        return false;
      }

      return true;
    }
    return false;
  }

  /**
   * Создание lock файла
   */
  createLockFile() {
    fs.writeFileSync(LOCK_FILE, new Date().toISOString());
  }

  /**
   * Удаление lock файла
   */
  removeLockFile() {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
      logger.info('Lock файл удален');
    }
  }

  /**
   * Форматирование времени
   */
  formatDuration(startTime, endTime) {
    const duration = (endTime - startTime) / 1000;
    return `${duration.toFixed(2)} секунд`;
  }

  /**
   * Основной метод обработки
   */
  async processWithdrawals() {
    // Проверяем lock файл
    if (this.checkLockFile()) {
      logger.warn('⚠️ Обработка уже запущена, пропускаем текущий запуск');
      return false;
    }

    // Создаем lock файл
    this.createLockFile();
    this.isProcessing = true;
    this.startTime = new Date();

    try {
      logger.info('🚀 Запуск обработки заявок через Steam Market...');
      logger.info(`⏰ Время начала: ${this.startTime.toISOString()}`);

      // Обработка заявок
      const result = await this.withdrawalService.processAllPendingWithdrawals();

      const endTime = new Date();
      const duration = this.formatDuration(this.startTime, endTime);

      if (result.success) {
        logger.info('✅ Обработка заявок успешно завершена');
        logger.info(`📊 Статистика:`);
        logger.info(`   - Обработано заявок: ${result.processed}`);
        logger.info(`   - Успешно: ${result.successful}`);
        logger.info(`   - С ошибками: ${result.failed}`);
        logger.info(`   - Время выполнения: ${duration}`);

        // Системное уведомление если есть ошибки
        if (result.failed > 0) {
          logger.warn(`⚠️ СИСТЕМНОЕ УВЕДОМЛЕНИЕ: Завершена обработка заявок через Steam Market. С ошибками: ${result.failed} из ${result.processed}`);
        } else {
          logger.info(`🎉 СИСТЕМНОЕ УВЕДОМЛЕНИЕ: Все заявки обработаны успешно! Обработано: ${result.processed}`);
        }

        return true;
      } else {
        logger.error('❌ Обработка заявок завершена с ошибками');
        logger.error(`💥 Ошибка: ${result.message}`);
        logger.error(`⏱️ Время выполнения: ${duration}`);

        logger.error('🚨 СИСТЕМНОЕ УВЕДОМЛЕНИЕ [ERROR]: Критическая ошибка обработки заявок через Steam Market');

        return false;
      }

    } catch (error) {
      const endTime = new Date();
      const duration = this.formatDuration(this.startTime, endTime);

      logger.error('💥 Критическая ошибка процессора:', error);
      logger.error(`⏱️ Время до ошибки: ${duration}`);
      logger.error('🚨 СИСТЕМНОЕ УВЕДОМЛЕНИЕ [CRITICAL]: Критический сбой процессора withdrawal');

      return false;

    } finally {
      this.isProcessing = false;
      this.removeLockFile();

      const endTime = new Date();
      logger.info('📋 Итоговая статистика обработки:');
      logger.info(`    Время начала: ${this.startTime.toISOString()}`);
      logger.info(`    Время окончания: ${endTime.toISOString()}`);
      logger.info(`    Длительность: ${this.formatDuration(this.startTime, endTime)}`);
    }
  }

  /**
   * Graceful shutdown
   */
  setupGracefulShutdown() {
    const signals = ['SIGTERM', 'SIGINT'];

    signals.forEach(signal => {
      process.on(signal, () => {
        logger.info(`🛑 Получен сигнал ${signal}, завершаем работу...`);

        if (this.isProcessing) {
          logger.info('⏳ Ожидаем завершения текущей обработки...');
          // Даем время завершить текущую операцию
          setTimeout(() => {
            this.removeLockFile();
            process.exit(0);
          }, 10000); // 10 секунд на graceful shutdown
        } else {
          this.removeLockFile();
          process.exit(0);
        }
      });
    });
  }
}

// Функция для разового запуска
async function runOnce() {
  const processor = new SteamWithdrawalProcessor();
  processor.setupGracefulShutdown();

  const success = await processor.processWithdrawals();
  process.exit(success ? 0 : 1);
}

// Функция для мониторинга (запуск каждые N минут)
async function runMonitoring(intervalMinutes = 5) {
  logger.info(`🔄 Запуск мониторинга withdrawal (интервал: ${intervalMinutes} минут)`);

  const processor = new SteamWithdrawalProcessor();
  processor.setupGracefulShutdown();

  // Первый запуск
  await processor.processWithdrawals();

  // Затем по расписанию
  setInterval(async () => {
    if (!processor.isProcessing) {
      await processor.processWithdrawals();
    } else {
      logger.info('⏳ Пропускаем запуск - предыдущая обработка еще не завершена');
    }
  }, intervalMinutes * 60 * 1000);
}

// Определяем режим запуска
const args = process.argv.slice(2);

if (args.includes('--monitor')) {
  const interval = parseInt(args[args.indexOf('--monitor') + 1]) || 5;
  runMonitoring(interval);
} else if (args.includes('--help')) {
  console.log('🔧 Steam Withdrawal Processor');
  console.log('');
  console.log('Использование:');
  console.log('  node process-steam-withdrawals.js           # Разовый запуск');
  console.log('  node process-steam-withdrawals.js --monitor [минуты]  # Мониторинг');
  console.log('');
  console.log('Примеры:');
  console.log('  node process-steam-withdrawals.js --monitor 10   # Каждые 10 минут');
  console.log('  node process-steam-withdrawals.js --monitor       # Каждые 5 минут (по умолчанию)');
} else {
  runOnce();
}
