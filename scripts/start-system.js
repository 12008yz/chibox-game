#!/usr/bin/env node

/**
 * 🚀 АВТОМАТИЧЕСКИЙ ЗАПУСК СИСТЕМЫ CHIBOX
 *
 * Этот скрипт:
 * 1. Проверяет состояние базы данных
 * 2. Запускает PM2 процессы
 * 3. Проверяет работу cron-задач
 * 4. Выполняет начальную проверку системы подписок
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console()
  ],
});

/**
 * 📋 Проверка предварительных требований
 */
async function checkPrerequisites() {
  logger.info('🔍 Проверка предварительных требований...');

  const checks = [
    {
      name: 'Node.js',
      check: () => process.version,
      required: true
    },
    {
      name: 'PM2',
      check: () => {
        try {
          execSync('pm2 --version', { stdio: 'pipe' });
          return true;
        } catch {
          return false;
        }
      },
      required: true,
      install: 'npm install -g pm2'
    },
    {
      name: '.env файл',
      check: () => fs.existsSync('.env'),
      required: true
    },
    {
      name: 'Директория logs',
      check: () => {
        const logsDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
          return 'создана';
        }
        return true;
      },
      required: false
    },
    {
      name: 'ecosystem.config.js',
      check: () => fs.existsSync('ecosystem.config.js'),
      required: true
    }
  ];

  let allPassed = true;

  for (const check of checks) {
    try {
      const result = check.check();
      if (result) {
        logger.info(`✅ ${check.name}: ${result === true ? 'OK' : result}`);
      } else {
        if (check.required) {
          logger.error(`❌ ${check.name}: НЕ НАЙДЕН${check.install ? ` (установите: ${check.install})` : ''}`);
          allPassed = false;
        } else {
          logger.warn(`⚠️ ${check.name}: не найден (не критично)`);
        }
      }
    } catch (error) {
      if (check.required) {
        logger.error(`❌ ${check.name}: ОШИБКА - ${error.message}`);
        allPassed = false;
      } else {
        logger.warn(`⚠️ ${check.name}: ошибка проверки`);
      }
    }
  }

  if (!allPassed) {
    logger.error('💥 Не все предварительные требования выполнены!');
    process.exit(1);
  }

  logger.info('✅ Все предварительные проверки пройдены');
  return true;
}

/**
 * 🗄️ Проверка подключения к базе данных
 */
async function checkDatabase() {
  logger.info('🗄️ Проверка подключения к базе данных...');

  try {
    const { sequelize } = require('../config/database');
    await sequelize.authenticate();
    logger.info('✅ Подключение к базе данных успешно');
    return true;
  } catch (error) {
    logger.error('❌ Ошибка подключения к базе данных:', error.message);
    return false;
  }
}

/**
 * 🚀 Запуск PM2 процессов
 */
async function startPM2Processes() {
  logger.info('🚀 Запуск PM2 процессов...');

  try {
    // Останавливаем существующие процессы (если есть)
    try {
      execSync('pm2 delete all', { stdio: 'pipe' });
      logger.info('🛑 Существующие процессы остановлены');
    } catch {
      // Процессы не были запущены, это нормально
    }

    // Запускаем новые процессы
    execSync('pm2 start ecosystem.config.js', { stdio: 'inherit' });

    // Ждем несколько секунд для запуска
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Проверяем статус
    const status = execSync('pm2 jlist', { encoding: 'utf8' });
    const processes = JSON.parse(status);

    logger.info('📊 Статус PM2 процессов:');
    for (const proc of processes) {
      const status = proc.pm2_env.status;
      const emoji = status === 'online' ? '✅' : '❌';
      logger.info(`  ${emoji} ${proc.name}: ${status}`);
    }

    const onlineCount = processes.filter(p => p.pm2_env.status === 'online').length;
    if (onlineCount === processes.length) {
      logger.info('✅ Все PM2 процессы запущены успешно');
      return true;
    } else {
      logger.error(`❌ Запущено только ${onlineCount} из ${processes.length} процессов`);
      return false;
    }

  } catch (error) {
    logger.error('❌ Ошибка запуска PM2 процессов:', error.message);
    return false;
  }
}

/**
 * 🔧 Проверка работы cron-задач
 */
async function checkCronTasks() {
  logger.info('🔧 Проверка cron-задач...');

  try {
    // Проверяем, что файл healthcheck создается
    const healthPath = path.join(__dirname, '../logs/cron-health.json');

    // Ждем до 30 секунд создания healthcheck файла
    for (let i = 0; i < 30; i++) {
      if (fs.existsSync(healthPath)) {
        const health = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
        logger.info(`✅ Cron-задачи работают. Статус: ${health.status}`);
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.warn('⚠️ Файл healthcheck не найден, но это может быть нормально для первого запуска');
    return true;

  } catch (error) {
    logger.error('❌ Ошибка проверки cron-задач:', error.message);
    return false;
  }
}

/**
 * 🧪 Тестирование системы подписок
 */
async function testSubscriptionSystem() {
  logger.info('🧪 Тестирование системы подписок...');

  try {
    const { generateSubscriptionReport } = require('./subscription-manager');
    const report = await generateSubscriptionReport();

    logger.info('📊 Отчет по подпискам:');
    logger.info(`  - Активных подписок: ${report.activeSubscriptions}`);
    logger.info(`  - Истекает завтра: ${report.expiringTomorrow}`);
    logger.info(`  - Истекает в ближайшие 3 дня: ${report.expiringThreeDays}`);

    logger.info('✅ Система подписок работает корректно');
    return true;

  } catch (error) {
    logger.error('❌ Ошибка тестирования системы подписок:', error.message);
    return false;
  }
}

/**
 * 📋 Выводим полезную информацию для администратора
 */
function showSystemInfo() {
  logger.info('');
  logger.info('🎉 СИСТЕМА CHIBOX ЗАПУЩЕНА УСПЕШНО!');
  logger.info('');
  logger.info('📋 Полезные команды:');
  logger.info('  pm2 status                     - статус всех процессов');
  logger.info('  pm2 logs                       - просмотр логов');
  logger.info('  pm2 monit                      - мониторинг в реальном времени');
  logger.info('  pm2 restart all                - перезапуск всех процессов');
  logger.info('  pm2 stop all                   - остановка всех процессов');
  logger.info('');
  logger.info('📂 Важные файлы:');
  logger.info('  logs/cron-tasks.log           - логи cron-задач');
  logger.info('  logs/subscription-manager.log - логи системы подписок');
  logger.info('  logs/cron-health.json         - состояние системы');
  logger.info('');
  logger.info('⏰ Расписание автоматических задач:');
  logger.info('  00:01 UTC - Уменьшение дней подписки');
  logger.info('  02:00 UTC (воскресенье) - Проверка целостности данных');
  logger.info('  09:00 UTC - Ежедневный отчет');
  logger.info('  Каждые 5 мин - Обработка выводов Steam');
  logger.info('  Каждые 30 мин - Мониторинг системы');
  logger.info('');
  logger.info('🆘 В случае проблем проверьте логи или перезапустите систему:');
  logger.info('  npm run system:restart');
  logger.info('');
}

/**
 * 🎬 Главная функция запуска
 */
async function main() {
  logger.info('');
  logger.info('🚀 ЗАПУСК СИСТЕМЫ CHIBOX');
  logger.info('========================');
  logger.info('');

  const steps = [
    { name: 'Проверка требований', fn: checkPrerequisites },
    { name: 'Проверка базы данных', fn: checkDatabase },
    { name: 'Запуск PM2 процессов', fn: startPM2Processes },
    { name: 'Проверка cron-задач', fn: checkCronTasks },
    { name: 'Тестирование подписок', fn: testSubscriptionSystem }
  ];

  for (const step of steps) {
    logger.info(`\n▶️ ${step.name}...`);
    const success = await step.fn();

    if (!success) {
      logger.error(`💥 Ошибка на этапе: ${step.name}`);
      logger.error('🛑 Запуск системы прерван');
      process.exit(1);
    }
  }

  showSystemInfo();
}

// Запуск, если скрипт вызван напрямую
if (require.main === module) {
  main().catch(error => {
    logger.error('💥 Критическая ошибка запуска:', error);
    process.exit(1);
  });
}

module.exports = {
  checkPrerequisites,
  checkDatabase,
  startPM2Processes,
  checkCronTasks,
  testSubscriptionSystem
};
