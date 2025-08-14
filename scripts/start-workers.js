const { queues, logger, cleanStalledJobs } = require('../services/queueService');
const { updateUserAchievementProgress } = require('../services/achievementService');
const { xpService } = require('../services/xpService');
const processSteamWithdrawals = require('./send-steam-withdrawals');

console.log('🚀 Запуск воркеров для обработки очередей...');

// Очищаем зависшие задачи при запуске
cleanStalledJobs().catch(error => {
  logger.error('Ошибка очистки зависших задач:', error);
});

// Обработчик для очереди достижений
queues.achievements.process('update-achievements', async (job) => {
  const { userId, achievementType, value } = job.data;

  try {
    logger.info(`Обработка достижения для пользователя ${userId}: ${achievementType} = ${value}`);

    if (updateUserAchievementProgress && typeof updateUserAchievementProgress === 'function') {
      await updateUserAchievementProgress(userId, achievementType, value);
    } else {
      logger.warn('updateUserAchievementProgress не найден');
    }

    return { success: true, message: 'Достижение обновлено' };
  } catch (error) {
    logger.error(`Ошибка обновления достижения:`, error);
    throw error;
  }
});

// Обработчик для очереди начисления XP
queues.achievements.process('add-experience', async (job) => {
  const { userId, amount, reason } = job.data;

  try {
    logger.info(`Начисление XP пользователю ${userId}: ${amount} за "${reason}"`);

    if (xpService && typeof xpService.addExperience === 'function') {
      await xpService.addExperience(userId, amount, reason);
    } else {
      logger.warn('xpService не найден или метод addExperience отсутствует');
    }

    return { success: true, message: 'XP начислен' };
  } catch (error) {
    logger.error(`Ошибка начисления XP:`, error);
    throw error;
  }
});

// Обработчик для очереди Steam withdrawal
queues.withdrawals.process('process-withdrawal', async (job) => {
  const { withdrawalId } = job.data;

  try {
    logger.info(`Обработка withdrawal #${withdrawalId}`);

    await processSteamWithdrawals();

    return { success: true, message: 'Withdrawal обработан' };
  } catch (error) {
    logger.error(`Ошибка обработки withdrawal:`, error);
    throw error;
  }
});

// Обработчик для очереди уведомлений
queues.notifications.process('send-notification', async (job) => {
  const { userId, title, message, type } = job.data;

  try {
    logger.info(`Отправка уведомления пользователю ${userId}: ${title}`);

    const { Notification } = require('../models');
    await Notification.create({
      user_id: userId,
      title,
      message,
      type: type || 'info',
      category: 'system',
      is_read: false,
      importance: 'normal'
    });

    return { success: true, message: 'Уведомление отправлено' };
  } catch (error) {
    logger.error(`Ошибка отправки уведомления:`, error);
    throw error;
  }
});

// Обработчик для очереди отчетов
queues.reports.process('generate-report', async (job) => {
  const { type, parameters } = job.data;

  try {
    logger.info(`Генерация отчета типа: ${type}`);

    // Здесь будет логика генерации отчетов
    return { success: true, message: `Отчет ${type} сгенерирован` };
  } catch (error) {
    logger.error(`Ошибка генерации отчета:`, error);
    throw error;
  }
});

// Обработчик для очереди пользовательской статистики
queues.userStats.process('update-user-stats', async (job) => {
  const { userId, statsData } = job.data;

  try {
    logger.info(`Обновление статистики пользователя ${userId}`);

    const { User } = require('../models');
    const user = await User.findByPk(userId);

    if (user) {
      // Обновляем статистику пользователя
      if (statsData.cases_opened) {
        user.total_cases_opened = (user.total_cases_opened || 0) + statsData.cases_opened;
      }
      if (statsData.items_value) {
        user.total_items_value = (user.total_items_value || 0) + statsData.items_value;
      }
      if (statsData.best_item_value && statsData.best_item_value > (user.best_item_value || 0)) {
        user.best_item_value = statsData.best_item_value;
      }

      await user.save();
    }

    return { success: true, message: 'Статистика пользователя обновлена' };
  } catch (error) {
    logger.error(`Ошибка обновления статистики пользователя:`, error);
    throw error;
  }
});

logger.info('✅ Все воркеры запущены и готовы к обработке задач');

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('🛑 Получен сигнал SIGINT, завершение работы воркеров...');

  const closePromises = Object.values(queues).map(queue => queue.close());
  await Promise.all(closePromises);

  logger.info('✅ Все воркеры остановлены');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('🛑 Получен сигнал SIGTERM, завершение работы воркеров...');

  const closePromises = Object.values(queues).map(queue => queue.close());
  await Promise.all(closePromises);

  logger.info('✅ Все воркеры остановлены');
  process.exit(0);
});
