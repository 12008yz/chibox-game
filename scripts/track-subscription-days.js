const db = require('../models');
const { updateUserAchievementProgress } = require('../services/achievementService');
const winston = require('winston');

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

/**
 * Функция для проверки и обновления ежедневных стриков
 */
async function trackDailyStreaks() {
  try {
    logger.info('🔄 Начало проверки ежедневных стриков...');

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    logger.info(`📅 Проверяем активность за сегодня: ${todayStart.toISOString()} - ${todayEnd.toISOString()}`);

    // Получаем всех активных пользователей (кто заходил сегодня)
    const activeUsersToday = await db.User.findAll({
      where: {
        last_login_date: {
          [db.Sequelize.Op.between]: [todayStart, todayEnd]
        }
      },
      attributes: ['id', 'daily_streak', 'max_daily_streak', 'last_login_date', 'last_activity_date']
    });

    logger.info(`👥 Найдено ${activeUsersToday.length} активных пользователей сегодня`);

    let streakUpdatedCount = 0;
    let streakResetCount = 0;
    let achievementUpdatedCount = 0;

    for (const user of activeUsersToday) {
      try {
        const lastActivityDate = user.last_activity_date ? new Date(user.last_activity_date) : null;
        const lastLoginDate = user.last_login_date ? new Date(user.last_login_date) : null;

        // Проверяем, была ли активность вчера
        let hadActivityYesterday = false;

        if (lastActivityDate) {
          const activityDate = new Date(lastActivityDate);
          activityDate.setHours(0, 0, 0, 0);

          if (activityDate.getTime() === yesterday.getTime()) {
            hadActivityYesterday = true;
          }
        }

        let newStreak = 1; // По умолчанию стрик равен 1 (сегодняшний день)

        if (hadActivityYesterday && user.daily_streak > 0) {
          // Если была активность вчера, увеличиваем стрик
          newStreak = user.daily_streak + 1;
          streakUpdatedCount++;
        } else if (user.daily_streak > 0) {
          // Если не было активности вчера, сбрасываем стрик
          newStreak = 1;
          streakResetCount++;
        } else {
          // Новый пользователь или первый день стрика
          newStreak = 1;
          streakUpdatedCount++;
        }

        // Обновляем максимальный стрик, если нужно
        const newMaxStreak = Math.max(user.max_daily_streak || 0, newStreak);

        // Обновляем пользователя
        await user.update({
          daily_streak: newStreak,
          max_daily_streak: newMaxStreak,
          last_activity_date: new Date()
        });

        // Обновляем достижения для daily_streak
        await updateUserAchievementProgress(user.id, 'daily_streak', newStreak);
        achievementUpdatedCount++;

        logger.info(`📈 Пользователь ${user.id}: стрик ${newStreak} дней (макс: ${newMaxStreak})`);

      } catch (error) {
        logger.error(`❌ Ошибка обновления стрика для пользователя ${user.id}:`, error);
      }
    }

    // Сбрасываем стрики у пользователей, которые не заходили сегодня
    const inactiveUsers = await db.User.findAll({
      where: {
        daily_streak: {
          [db.Sequelize.Op.gt]: 0
        },
        last_login_date: {
          [db.Sequelize.Op.lt]: todayStart
        }
      },
      attributes: ['id', 'daily_streak']
    });

    logger.info(`💤 Найдено ${inactiveUsers.length} неактивных пользователей для сброса стрика`);

    for (const user of inactiveUsers) {
      try {
        await user.update({
          daily_streak: 0
        });
        streakResetCount++;
        logger.info(`🔄 Сброшен стрик для неактивного пользователя ${user.id}`);
      } catch (error) {
        logger.error(`❌ Ошибка сброса стрика для пользователя ${user.id}:`, error);
      }
    }

    logger.info(`✅ Проверка ежедневных стриков завершена:`);
    logger.info(`   📊 Активных пользователей: ${activeUsersToday.length}`);
    logger.info(`   📈 Стриков обновлено: ${streakUpdatedCount}`);
    logger.info(`   🔄 Стриков сброшено: ${streakResetCount}`);
    logger.info(`   🏆 Достижений обновлено: ${achievementUpdatedCount}`);

    return {
      success: true,
      activeUsers: activeUsersToday.length,
      streakUpdated: streakUpdatedCount,
      streakReset: streakResetCount,
      achievementUpdated: achievementUpdatedCount
    };

  } catch (error) {
    logger.error('❌ Критическая ошибка при проверке ежедневных стриков:', error);
    throw error;
  }
}

/**
 * Функция для обновления оставшихся дней подписки
 */
async function trackSubscriptionDays() {
  try {
    logger.info('🔄 Начало обновления дней подписки...');

    const now = new Date();

    // Находим всех пользователей с активной подпиской
    const usersWithSubscription = await db.User.findAll({
      where: {
        subscription_tier: {
          [db.Sequelize.Op.gt]: 0
        },
        subscription_expiry_date: {
          [db.Sequelize.Op.not]: null
        }
      },
      attributes: ['id', 'subscription_tier', 'subscription_expiry_date', 'subscription_days_left']
    });

    logger.info(`👥 Найдено ${usersWithSubscription.length} пользователей с активной подпиской`);

    let processedUsers = 0;
    let successCount = 0;
    let errorCount = 0;
    let expiredSubscriptions = 0;

    for (const user of usersWithSubscription) {
      try {
        processedUsers++;

        const expiryDate = new Date(user.subscription_expiry_date);
        const msLeft = expiryDate.getTime() - now.getTime();
        const daysLeft = msLeft > 0 ? Math.ceil(msLeft / (1000 * 60 * 60 * 24)) : 0;

        // Если подписка истекла
        if (daysLeft <= 0) {
          // Деактивируем подписку
          await user.update({
            subscription_tier: 0,
            subscription_days_left: 0,
            subscription_bonus_percentage: 0,
            max_daily_cases: 0,
            cases_available: 0
          });

          // Создаем уведомление об истечении подписки
          await db.Notification.create({
            user_id: user.id,
            title: 'Подписка истекла',
            message: 'Ваша подписка истекла. Продлите её, чтобы продолжить пользоваться преимуществами!',
            type: 'warning',
            category: 'subscription',
            importance: 7,
            link: '/subscription'
          });

          expiredSubscriptions++;
          logger.info(`❌ Подписка пользователя ${user.id} истекла`);
        } else {
          // Обновляем количество оставшихся дней
          await user.update({
            subscription_days_left: daysLeft
          });

          logger.info(`📅 Пользователь ${user.id}: осталось ${daysLeft} дней подписки`);
        }

        successCount++;

      } catch (error) {
        errorCount++;
        logger.error(`❌ Ошибка обновления подписки для пользователя ${user.id}:`, error);
      }
    }

    logger.info(`✅ Обновление дней подписки завершено:`);
    logger.info(`   📊 Обработано пользователей: ${processedUsers}`);
    logger.info(`   ✅ Успешно: ${successCount}`);
    logger.info(`   ❌ Ошибок: ${errorCount}`);
    logger.info(`   ⏰ Истекших подписок: ${expiredSubscriptions}`);

    return {
      processedUsers,
      successCount,
      errorCount,
      expiredSubscriptions
    };

  } catch (error) {
    logger.error('❌ Критическая ошибка при обновлении дней подписки:', error);
    throw error;
  }
}

// Запуск, если скрипт вызван напрямую
if (require.main === module) {
  // Запускаем обе функции
  Promise.all([
    trackDailyStreaks(),
    trackSubscriptionDays()
  ])
    .then(([streakResult, subscriptionResult]) => {
      logger.info('🎉 Скрипты выполнены успешно');
      logger.info('📊 Результаты стриков:', streakResult);
      logger.info('📊 Результаты подписок:', subscriptionResult);
      process.exit(0);
    })
    .catch((error) => {
      logger.error('💥 Фатальная ошибка в скриптах:', error);
      process.exit(1);
    });
}

module.exports = {
  trackDailyStreaks,
  trackSubscriptionDays
};
