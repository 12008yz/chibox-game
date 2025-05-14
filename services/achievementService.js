const db = require('../models');
const { Op } = require('sequelize');

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

  for (const achievement of achievements) {
    // Найти или создать запись UserAchievement для пользователя и достижения
    let [userAchievement, created] = await db.UserAchievement.findOrCreate({
      where: {
        user_id: userId,
        achievement_id: achievement.id
      },
      defaults: {
        current_progress: 0,
        is_completed: false,
        notified: false,
        bonus_applied: false
      }
    });

    if (userAchievement.is_completed) {
      // Уже выполнено, пропускаем
      continue;
    }

    // Обновить прогресс
    let newProgress;
    if (requirementType === 'best_item_value') {
      // Для достижения best_item_value прогресс - максимальная цена предмета
      newProgress = Math.max(userAchievement.current_progress, progressToAdd);
    } else {
      newProgress = userAchievement.current_progress + progressToAdd;
    }
    // Приводим прогресс к целому числу, чтобы избежать ошибок с типом integer в БД
    userAchievement.current_progress = Math.floor(newProgress);

    // Проверить выполнение
    if (newProgress >= achievement.requirement_value) {
      userAchievement.is_completed = true;
      userAchievement.completion_date = new Date();

      if (!userAchievement.bonus_applied && achievement.bonus_percentage > 0) {
        // Пример применения бонуса: увеличить бонус шанса выпадения предметов у пользователя
        const user = await db.User.findByPk(userId);
        user.bonus_chance = (user.bonus_chance || 0) + achievement.bonus_percentage;
        await user.save();

        userAchievement.bonus_applied = true;
      }

      // Отправить уведомление, если еще не отправлено
      if (!userAchievement.notified) {
        await sendAchievementNotification(userId, achievement);
        userAchievement.notified = true;
      }

      completedAchievements.push(achievement);
    }

    await userAchievement.save();
  }

  return completedAchievements;
}

module.exports = {
  updateUserAchievementProgress,
  sendAchievementNotification
};
