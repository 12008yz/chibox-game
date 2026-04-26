#!/usr/bin/env node

/**
 * 🕒 УЛУЧШЕННАЯ СИСТЕМА CRON-ЗАДАЧ CHIBOX
 *
 * Основные задачи:
 * - Ежедневное уменьшение дней подписки (00:08)
 * - Проверка целостности данных (еженедельно)
 * - Обработка выводов Steam (каждые 5 минут)
 * - Мониторинг и healthcheck
 */

const cron = require('node-cron');
const processSteamWithdrawals = require('./send-steam-withdrawals');
const {
  decreaseSubscriptionDays,
  validateSubscriptionData,
  generateSubscriptionReport,
  logger
} = require('./subscription-manager');
const winston = require('winston');
const path = require('path');
const fs = require('fs');
const ENABLE_STEAM_WITHDRAWAL_CRON = process.env.ENABLE_STEAM_WITHDRAWAL_CRON === 'true';

// Создаем директорию для логов
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Дополнительный логгер для cron-задач
const cronLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [CRON-${level.toUpperCase()}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logsDir, 'cron-tasks.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    })
  ],
});

cronLogger.info('🚀 Запуск улучшенной системы cron-задач...');

// 📊 Статистика выполнения задач
const taskStats = {
  subscriptionUpdates: { success: 0, errors: 0, lastRun: null },
  validationChecks: { success: 0, errors: 0, lastRun: null },
  withdrawalProcessing: { success: 0, errors: 0, lastRun: null }
};

/**
 * 🎯 Основная задача: Уменьшение дней подписки
 * Выполняется каждый день в 16:00 по МСК (13:00 UTC)
 */
cron.schedule('0 0 13 * * *', async () => {
  cronLogger.info('🔄 Запуск уменьшения дней подписки (ежедневно в 16:00 МСК)...');

  try {
    const startTime = Date.now();
    const result = await decreaseSubscriptionDays();

    taskStats.subscriptionUpdates.success++;
    taskStats.subscriptionUpdates.lastRun = new Date();

    cronLogger.info('✅ Уменьшение дней подписки завершено успешно:', {
      duration: Date.now() - startTime,
      processed: result.processed,
      deactivated: result.deactivated,
      warnings: result.warnings
    });

    // Если есть критические ошибки, отправляем уведомление администратору
    if (result.errors && result.errors.length > 0) {
      cronLogger.warn('⚠️ Обнаружены ошибки при обработке подписок:', {
        errorCount: result.errors.length,
        errors: result.errors.slice(0, 5) // Показываем первые 5 ошибок
      });
    }

  } catch (error) {
    taskStats.subscriptionUpdates.errors++;
    cronLogger.error('❌ Критическая ошибка при уменьшении дней подписки:', error);

    // Здесь можно добавить отправку уведомления администратору
    // await sendAdminAlert('Ошибка в системе подписок', error.message);
  }
});

/**
 * 🔍 Еженедельная проверка целостности данных
 * Каждое воскресенье в 02:00 UTC
 */
cron.schedule('0 2 * * 0', async () => {
  cronLogger.info('🔍 Запуск еженедельной проверки целостности подписок...');

  try {
    const result = await validateSubscriptionData();

    taskStats.validationChecks.success++;
    taskStats.validationChecks.lastRun = new Date();

    cronLogger.info('✅ Проверка целостности завершена:', {
      fixedRecords: result.fixed
    });

    if (result.fixed > 0) {
      cronLogger.warn('⚠️ Обнаружены и исправлены несоответствия в данных подписок:', {
        count: result.fixed
      });
    }

  } catch (error) {
    taskStats.validationChecks.errors++;
    cronLogger.error('❌ Ошибка проверки целостности:', error);
  }
}, {
  timezone: "UTC"
});

/**
 * 💰 Обработка заявок на вывод Steam предметов
 * Каждые 5 минут (можно отключить: ENABLE_STEAM_WITHDRAWAL_CRON=false)
 */
if (ENABLE_STEAM_WITHDRAWAL_CRON) {
  cron.schedule('*/5 * * * *', async () => {
    cronLogger.debug('🔄 Проверка заявок на вывод Steam предметов...');

    try {
      await processSteamWithdrawals();

      taskStats.withdrawalProcessing.success++;
      taskStats.withdrawalProcessing.lastRun = new Date();

      cronLogger.debug('✅ Проверка выводов завершена');

    } catch (error) {
      taskStats.withdrawalProcessing.errors++;
      cronLogger.error('❌ Ошибка при обработке выводов:', error);
    }
  });
} else {
  cronLogger.warn('⏸️ Steam withdrawal cron отключен (ENABLE_STEAM_WITHDRAWAL_CRON=false)');
}

/**
 * 📊 Ежедневный отчет по системе подписок
 * Каждый день в 09:00 UTC (12:00 МСК)
 */
cron.schedule('0 9 * * *', async () => {
  cronLogger.info('📊 Генерация ежедневного отчета по подпискам...');

  try {
    const report = await generateSubscriptionReport();

    cronLogger.info('📈 Ежедневный отчет сгенерирован:', {
      activeSubscriptions: report.activeSubscriptions,
      expiringTomorrow: report.expiringTomorrow,
      expiringThreeDays: report.expiringThreeDays
    });

    // Сохраняем отчет в файл
    const reportPath = path.join(logsDir, `subscription-report-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  } catch (error) {
    cronLogger.error('❌ Ошибка генерации отчета:', error);
  }
}, {
  timezone: "UTC"
});

/**
 * 🏥 Healthcheck и мониторинг системы
 * Каждые 30 минут
 */
cron.schedule('*/30 * * * *', async () => {
  const now = new Date();
  const healthData = {
    timestamp: now.toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    taskStats: taskStats,
    status: 'healthy'
  };

  // Проверяем, были ли критические ошибки
  const totalErrors = Object.values(taskStats).reduce((sum, stat) => sum + stat.errors, 0);

  if (totalErrors > 10) {
    healthData.status = 'warning';
    cronLogger.warn('⚠️ Обнаружено много ошибок в cron-задачах:', { totalErrors });
  }

  cronLogger.debug('🏥 Healthcheck выполнен:', {
    status: healthData.status,
    uptime: Math.round(healthData.uptime / 60) + 'min',
    memoryMB: Math.round(healthData.memoryUsage.rss / 1024 / 1024)
  });

  // Сохраняем healthcheck в файл
  const healthPath = path.join(logsDir, 'cron-health.json');
  fs.writeFileSync(healthPath, JSON.stringify(healthData, null, 2));
});

/**
 * 🧹 Очистка старых логов
 * Каждый день в 03:00 UTC
 */
cron.schedule('0 3 * * *', async () => {
  cronLogger.info('🧹 Очистка старых логов...');

  try {
    const logFiles = fs.readdirSync(logsDir);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let deletedCount = 0;

    for (const file of logFiles) {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);

      // Удаляем файлы старше 30 дней
      if (stats.mtime < thirtyDaysAgo && file.includes('report')) {
        fs.unlinkSync(filePath);
        deletedCount++;
      }
    }

    cronLogger.info(`🧹 Очистка завершена. Удалено файлов: ${deletedCount}`);

  } catch (error) {
    cronLogger.error('❌ Ошибка очистки логов:', error);
  }
});

// Обработка сигналов завершения
process.on('SIGINT', () => {
  cronLogger.info('🛑 Получен сигнал SIGINT, завершение cron-задач...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  cronLogger.info('🛑 Получен сигнал SIGTERM, завершение cron-задач...');
  process.exit(0);
});

// Обработка необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  cronLogger.error('🚨 Необработанное отклонение промиса:', {
    reason: reason,
    promise: promise
  });
});

process.on('uncaughtException', (error) => {
  cronLogger.error('🚨 Необработанное исключение:', error);
  process.exit(1);
});

cronLogger.info('✅ Все cron-задачи настроены и запущены успешно!');
cronLogger.info('📋 Расписание задач:');
cronLogger.info('  - ⚠️ Уменьшение дней подписки: КАЖДЫЕ 20 СЕКУНД (ТЕСТОВЫЙ РЕЖИМ!)');
cronLogger.info('  - Проверка целостности: еженедельно в воскресенье 02:00 UTC');
cronLogger.info(`  - Обработка выводов: ${ENABLE_STEAM_WITHDRAWAL_CRON ? 'каждые 5 минут' : 'ОТКЛЮЧЕНО'}`);
cronLogger.info('  - Ежедневный отчет: ежедневно в 09:00 UTC');
cronLogger.info('  - Healthcheck: каждые 30 минут');
cronLogger.info('  - Очистка логов: ежедневно в 03:00 UTC');

// Экспортируем статистику для мониторинга
module.exports = {
  taskStats,
  cronLogger
};
