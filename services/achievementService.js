const db = require('../models');
const { Op } = require('sequelize');
const { addExperience } = require('./xpService');

async function sendAchievementNotification(userId, achievement) {
  // Здесь можно реализовать отправку уведомления пользователю
  // Например, через email, push-уведомление или websocket
  console.log(`Уведомление: Пользователь ${userId} получил достижение "${achievement.name}"`);

  // Создать запись в таблице Notification
  await db.Notification.create({
    user_id: userId,
    type: 'success',  // исправлено на допустимое значение
    title: 'Достижение получено',  // добавлено обязательное поле
    category: 'achievement',  // добавлено обязательное поле
    message: `Вы получили достижение: ${achievement.name}`,
    date: new Date()
  });
}

async function updateUserAchievementProgress(userId, requirementType, progressToAdd) {
  // Найти активные достижения с данным типом требования
  const achievements = await db.Achievement.findAll({
    where: {
      requirement_type: requirementType,
      is_active: true
    }
  });

  const completedAchievements = [];

  // Получить все UserAchievement для пользователя и достижений
  const userAchievements = await db.UserAchievement.findAll({
    where: {
      user_id: userId,
      achievement_id: achievements.map(a => a.id)
    }
  });

  // Создать карту для быстрого доступа
  const userAchievementMap = new Map();
  userAchievements.forEach(ua => {
    userAchievementMap.set(ua.achievement_id, ua);
  });

  // Массив для bulk операций
  const bulkOperations = [];

  for (const achievement of achievements) {
    let userAchievement = userAchievementMap.get(achievement.id);

    if (!userAchievement) {
      userAchievement = db.UserAchievement.build({
        user_id: userId,
        achievement_id: achievement.id,
        current_progress: 0,
        is_completed: false,
        notified: false,
        bonus_applied: false
      });
    }

    if (userAchievement.is_completed) {
      // Уже выполнено, пропускаем
      continue;
    }

    // Обновить прогресс
    let newProgress;
    if (requirementType === 'best_item_value') {
      newProgress = Math.max(userAchievement.current_progress, progressToAdd);
    } else {
      newProgress = userAchievement.current_progress + progressToAdd;
    }
    userAchievement.current_progress = Math.floor(newProgress);

    // Проверить выполнение
    if (newProgress >= achievement.requirement_value) {
      userAchievement.is_completed = true;
      userAchievement.completion_date = new Date();

      if (!userAchievement.bonus_applied && achievement.bonus_percentage > 0) {
        // Применение бонуса к шансу выпадения дорогих предметов
        const user = await db.User.findByPk(userId);
        user.achievements_bonus_percentage = (user.achievements_bonus_percentage || 0) + achievement.bonus_percentage;

        // Пересчитываем общий бонус
        user.total_drop_bonus_percentage =
          (user.achievements_bonus_percentage || 0) +
          (user.level_bonus_percentage || 0) +
          (user.subscription_bonus_percentage || 0);

        await user.save();

        userAchievement.bonus_applied = true;
      }

      if (!userAchievement.notified) {
        await sendAchievementNotification(userId, achievement);
        userAchievement.notified = true;
      }

      await addExperience(userId, 100, 'achievement', achievement.id, 'Достижение выполнено');

      completedAchievements.push(achievement);
    }

    bulkOperations.push(userAchievement);
  }

  // Сохраняем все изменения bulk операцией
  await Promise.all(bulkOperations.map(ua => ua.save()));

  return completedAchievements;
}

module.exports = {
  updateUserAchievementProgress,
  sendAchievementNotification
};
