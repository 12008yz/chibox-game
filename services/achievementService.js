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

/**
 * Рассчитывает общую стоимость всех предметов, полученных пользователем за всё время
 * @param {string} userId - ID пользователя
 * @returns {number} Общая стоимость всех полученных предметов
 */
async function calculateTotalInventoryValue(userId) {
  // Сначала проверяем текущее значение в профиле пользователя
  const user = await db.User.findByPk(userId, {
    attributes: ['total_items_value']
  });

  if (user && user.total_items_value && user.total_items_value > 0) {
    // Если значение уже есть в профиле, используем его
    return Math.floor(parseFloat(user.total_items_value));
  }

  // Если значение не установлено, пересчитываем по всем предметам за всё время
  const inventoryItems = await db.UserInventory.findAll({
    where: {
      user_id: userId,
      item_type: 'item'
      // Убираем фильтр по статусу - считаем ВСЕ предметы за всё время
    },
    include: [{
      model: db.Item,
      as: 'item',
      attributes: ['price']
    }]
  });

  const totalValue = inventoryItems.reduce((sum, inventoryItem) => {
    if (inventoryItem.item && inventoryItem.item.price) {
      return sum + parseFloat(inventoryItem.item.price);
    }
    return sum;
  }, 0);

  // Обновляем значение в профиле пользователя для будущих запросов
  if (user && totalValue > 0) {
    await user.update({ total_items_value: totalValue });
  }

  return Math.floor(totalValue);
}

/**
 * Рассчитывает стоимость самого дорогого предмета, полученного пользователем за всё время
 * @param {string} userId - ID пользователя
 * @returns {number} Стоимость самого дорогого предмета
 */
async function calculateBestItemValue(userId) {
  // Сначала проверяем текущее значение в профиле пользователя
  const user = await db.User.findByPk(userId, {
    attributes: ['best_item_value']
  });

  if (user && user.best_item_value && user.best_item_value > 0) {
    // Если значение уже есть в профиле, используем его
    return Math.floor(parseFloat(user.best_item_value));
  }

  // Если значение не установлено, пересчитываем по всем предметам за всё время
  const bestItem = await db.UserInventory.findOne({
    where: {
      user_id: userId,
      item_type: 'item'
      // Убираем фильтр по статусу - ищем среди ВСЕХ предметов за всё время
    },
    include: [{
      model: db.Item,
      as: 'item',
      attributes: ['price']
    }],
    order: [[{model: db.Item, as: 'item'}, 'price', 'DESC']]
  });

  let bestValue = 0;
  if (bestItem && bestItem.item && bestItem.item.price) {
    bestValue = Math.floor(parseFloat(bestItem.item.price));

    // Обновляем значение в профиле пользователя для будущих запросов
    if (user && bestValue > 0) {
      await user.update({ best_item_value: bestValue });
    }
  }

  return bestValue;
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
      // Для лучшего предмета перерассчитываем актуальную стоимость из инвентаря
      newProgress = await calculateBestItemValue(userId);
    } else if (requirementType === 'total_items_value') {
      // Для общей стоимости перерассчитываем всю стоимость инвентаря
      newProgress = await calculateTotalInventoryValue(userId);
    } else if (requirementType === 'subscription_days') {
      // Для дней подписки накапливаем общее количество дней
      newProgress = userAchievement.current_progress + progressToAdd;
    } else if (requirementType === 'daily_streak') {
      // Для ежедневного стрика берем текущее значение стрика (не накапливаем)
      newProgress = Math.max(userAchievement.current_progress, progressToAdd);
    } else {
      // Для остальных типов просто добавляем
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
        const currentAchievementsBonus = user.achievements_bonus_percentage || 0;
        // Убираем ограничение на 5% и увеличиваем до 25%
        const newAchievementsBonus = Math.min(currentAchievementsBonus + achievement.bonus_percentage, 25.0);

        user.achievements_bonus_percentage = newAchievementsBonus;

        // Пересчитываем общий бонус с ограничением 30%
        user.total_drop_bonus_percentage = Math.min(
          newAchievementsBonus +
          (user.level_bonus_percentage || 0) +
          (user.subscription_bonus_percentage || 0),
          30.0
        );

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

/**
 * Обновляет достижения, связанные с инвентарем (total_items_value и best_item_value)
 * @param {string} userId - ID пользователя
 */
async function updateInventoryRelatedAchievements(userId) {
  try {
    // Обновляем достижение по общей стоимости инвентаря
    await updateUserAchievementProgress(userId, 'total_items_value', 0);

    // Обновляем достижение по лучшему предмету
    await updateUserAchievementProgress(userId, 'best_item_value', 0);

    console.log(`Обновлены достижения инвентаря для пользователя ${userId}`);
  } catch (error) {
    console.error('Ошибка обновления достижений инвентаря:', error);
  }
}

module.exports = {
  updateUserAchievementProgress,
  sendAchievementNotification,
  updateInventoryRelatedAchievements,
  calculateTotalInventoryValue,
  calculateBestItemValue
};
