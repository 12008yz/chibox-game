#!/usr/bin/env node

/**
 * 🎯 УЛУЧШЕННЫЙ МЕНЕДЖЕР ПОДПИСОК CHIBOX
 *
 * Основные функции:
 * - Ежедневное уменьшение дней подписки
 * - Проверка целостности данных
 * - Уведомления пользователям
 * - Деактивация просроченных подписок
 * - Мониторинг и логирование
 */

const db = require('../models');
const { createNotification } = require('../utils/notificationHelper');
const winston = require('winston');
const path = require('path');

// Создаем директорию для логов
const logsDir = path.join(__dirname, '../logs');
const fs = require('fs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logsDir, 'subscription-manager.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'subscription-errors.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3
    })
  ],
});

/**
 * 📉 Основная функция уменьшения дней подписки
 */
async function decreaseSubscriptionDays() {
  const startTime = Date.now();
  logger.info('🔄 Запуск уменьшения дней подписки...');

  try {
    const now = new Date();

    // Находим всех пользователей с активной подпиской
    const usersWithSubscription = await db.User.findAll({
      where: {
        [db.Sequelize.Op.or]: [
          { subscription_days_left: { [db.Sequelize.Op.gt]: 0 } },
          {
            subscription_expiry_date: {
              [db.Sequelize.Op.gt]: now
            }
          }
        ]
      },
      attributes: [
        'id', 'username', 'subscription_tier', 'subscription_days_left',
        'subscription_expiry_date', 'subscription_bonus_percentage',
        'max_daily_cases', 'cases_available'
      ]
    });

    logger.info(`👥 Найдено ${usersWithSubscription.length} пользователей с подписками`);

    let processedCount = 0;
    let deactivatedCount = 0;
    let warningsSent = 0;
    let errorsCount = 0;

    const results = {
      processed: 0,
      deactivated: 0,
      warnings: 0,
      errors: [],
      duration: 0
    };

    for (const user of usersWithSubscription) {
      try {
        processedCount++;

        // Проверяем согласованность данных
        const expiryDate = user.subscription_expiry_date ? new Date(user.subscription_expiry_date) : null;
        let currentDaysLeft = user.subscription_days_left || 0;

        // Если есть expiry_date, пересчитываем дни
        if (expiryDate) {
          const msLeft = expiryDate.getTime() - now.getTime();
          const calculatedDays = msLeft > 0 ? Math.ceil(msLeft / (24 * 60 * 60 * 1000)) : 0;

          // Синхронизируем, если есть расхождение больше 1 дня
          if (Math.abs(calculatedDays - currentDaysLeft) > 1) {
            logger.warn(`Синхронизация дней для пользователя ${user.id}: ${currentDaysLeft} -> ${calculatedDays}`);
            currentDaysLeft = calculatedDays;
          }
        }

        // Уменьшаем на 1 день
        const newDaysLeft = Math.max(0, currentDaysLeft - 1);

        // Отправляем предупреждения
        if (newDaysLeft === 3) {
          await createNotification(
            user.id,
            '⚠️ Подписка истекает через 3 дня',
            'Не забудьте продлить подписку, чтобы продолжить пользоваться всеми преимуществами!',
            'warning',
            'subscription',
            { link: '/subscription', importance: 8 }
          );
          warningsSent++;
        } else if (newDaysLeft === 1) {
          await createNotification(
            user.id,
            '🚨 Последний день подписки',
            'Ваш статус истекает завтра! Продлите её прямо сейчас.',
            'warning',
            'subscription',
            { link: '/subscription', importance: 9 }
          );
          warningsSent++;
        }

        // Если подписка истекла
        if (newDaysLeft === 0) {
          // Деактивируем подписку
          await user.update({
            subscription_tier: 0,
            subscription_days_left: 0,
            subscription_bonus_percentage: 0,
            max_daily_cases: 0,
            cases_available: 0,
            subscription_expiry_date: null
          });

          // Уведомление об истечении
          await createNotification(
            user.id,
            '❌ Подписка истекла',
            'Ваш статус истекл. Приобретите новую подписку, чтобы снова получать ежедневные кейсы и бонусы к дропу!',
            'error',
            'subscription',
            { link: '/subscription', importance: 10 }
          );

          deactivatedCount++;
          logger.info(`Подписка деактивирована для пользователя ${user.id} (@${user.username})`);
        } else {
          // Просто обновляем количество дней
          await user.update({
            subscription_days_left: newDaysLeft
          });

          logger.debug(`Пользователь ${user.id}: ${currentDaysLeft} -> ${newDaysLeft} дней`);
        }

      } catch (error) {
        errorsCount++;
        results.errors.push({
          userId: user.id,
          username: user.username,
          error: error.message
        });
        logger.error(`Ошибка обработки пользователя ${user.id}:`, error);
      }
    }

    // Финальная статистика
    const duration = Date.now() - startTime;
    results.processed = processedCount;
    results.deactivated = deactivatedCount;
    results.warnings = warningsSent;
    results.duration = duration;

    logger.info('✅ Уменьшение дней подписки завершено:', {
      processed: processedCount,
      deactivated: deactivatedCount,
      warnings: warningsSent,
      errors: errorsCount,
      duration: `${duration}ms`
    });

    return results;

  } catch (error) {
    logger.error('❌ Критическая ошибка в уменьшении дней подписки:', error);
    throw error;
  }
}

/**
 * 🔍 Проверка целостности данных подписок
 */
async function validateSubscriptionData() {
  logger.info('🔍 Запуск проверки целостности данных подписок...');

  try {
    const now = new Date();
    let fixedCount = 0;

    // Найти пользователей с несоответствиями
    const usersToFix = await db.User.findAll({
      where: {
        [db.Sequelize.Op.or]: [
          // Есть дни, но нет expiry_date
          {
            subscription_days_left: { [db.Sequelize.Op.gt]: 0 },
            subscription_expiry_date: null
          },
          // Есть expiry_date в прошлом, но дни > 0
          {
            subscription_expiry_date: { [db.Sequelize.Op.lt]: now },
            subscription_days_left: { [db.Sequelize.Op.gt]: 0 }
          }
        ]
      }
    });

    for (const user of usersToFix) {
      const daysLeft = user.subscription_days_left || 0;

      if (daysLeft > 0 && !user.subscription_expiry_date) {
        // Устанавливаем expiry_date на основе дней
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + daysLeft);

        await user.update({ subscription_expiry_date: expiryDate });
        fixedCount++;
        logger.info(`Исправлена expiry_date для пользователя ${user.id}: установлена на ${expiryDate.toISOString()}`);
      } else if (user.subscription_expiry_date && user.subscription_expiry_date < now && daysLeft > 0) {
        // Подписка уже истекла, сбрасываем дни
        await user.update({
          subscription_days_left: 0,
          subscription_tier: 0,
          subscription_bonus_percentage: 0,
          max_daily_cases: 0
        });
        fixedCount++;
        logger.info(`Исправлены данные истекшей подписки для пользователя ${user.id}`);
      }
    }

    logger.info(`✅ Проверка целостности завершена. Исправлено записей: ${fixedCount}`);
    return { fixed: fixedCount };

  } catch (error) {
    logger.error('❌ Ошибка проверки целостности:', error);
    throw error;
  }
}

/**
 * 📊 Генерация отчета по подпискам
 */
async function generateSubscriptionReport() {
  logger.info('📊 Генерация отчета по подпискам...');

  try {
    const now = new Date();

    // Статистика активных подписок
    const activeSubscriptions = await db.User.count({
      where: {
        subscription_days_left: { [db.Sequelize.Op.gt]: 0 }
      }
    });

    // По тарифам
    const tierStats = await db.User.findAll({
      attributes: [
        'subscription_tier',
        [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'count']
      ],
      where: {
        subscription_days_left: { [db.Sequelize.Op.gt]: 0 }
      },
      group: ['subscription_tier'],
      raw: true
    });

    // Истекающие в ближайшие дни
    const expiringTomorrow = await db.User.count({
      where: { subscription_days_left: 1 }
    });

    const expiringThreeDays = await db.User.count({
      where: { subscription_days_left: { [db.Sequelize.Op.lte]: 3, [db.Sequelize.Op.gt]: 0 } }
    });

    const report = {
      timestamp: now.toISOString(),
      activeSubscriptions,
      tierStats,
      expiringTomorrow,
      expiringThreeDays,
      health: 'OK'
    };

    logger.info('📈 Отчет по подпискам:', report);
    return report;

  } catch (error) {
    logger.error('❌ Ошибка генерации отчета:', error);
    throw error;
  }
}

// Экспорт функций
module.exports = {
  decreaseSubscriptionDays,
  validateSubscriptionData,
  generateSubscriptionReport,
  logger
};

// Если скрипт запущен напрямую
if (require.main === module) {
  const action = process.argv[2] || 'decrease';

  switch (action) {
    case 'decrease':
      decreaseSubscriptionDays()
        .then(result => {
          logger.info('🎉 Успешно завершено уменьшение дней подписки');
          process.exit(0);
        })
        .catch(error => {
          logger.error('💥 Фатальная ошибка:', error);
          process.exit(1);
        });
      break;

    case 'validate':
      validateSubscriptionData()
        .then(result => {
          logger.info('🎉 Проверка целостности завершена');
          process.exit(0);
        })
        .catch(error => {
          logger.error('💥 Ошибка проверки:', error);
          process.exit(1);
        });
      break;

    case 'report':
      generateSubscriptionReport()
        .then(result => {
          console.log(JSON.stringify(result, null, 2));
          process.exit(0);
        })
        .catch(error => {
          logger.error('💥 Ошибка отчета:', error);
          process.exit(1);
        });
      break;

    default:
      console.log('Использование: node subscription-manager.js [decrease|validate|report]');
      process.exit(1);
  }
}
