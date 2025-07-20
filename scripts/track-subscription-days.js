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

// Запуск, если скрипт вызван напрямую
if (require.main === module) {
  trackDailyStreaks()
    .then(() => {
      logger.info('🎉 Скрипт проверки ежедневных стриков выполнен успешно');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('💥 Фатальная ошибка в скрипте проверки ежедневных стриков:', error);
      process.exit(1);
    });
}

module.exports = {
  trackDailyStreaks
};
