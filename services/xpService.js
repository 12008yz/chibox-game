const db = require('../models');
const { updateLevelBonus } = require('../utils/userBonusCalculator');

async function addExperience(userId, amount, sourceType, sourceId = null, description = '') {
  try {
    // Создаем запись о транзакции опыта
    let isLevelUp = false;
    let newLevel = null;

    const user = await db.User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Добавляем опыт
    const updatedXp = (user.xp || 0) + amount;

    // Получаем настройки уровня пользователя
    const currentLevelSettings = await db.LevelSettings.findOne({ where: { level: user.level } });
    const nextLevelSettings = await db.LevelSettings.findOne({ where: { level: user.level + 1 } });

    // Проверяем, достиг ли пользователь порога для повышения уровня
    if (nextLevelSettings && updatedXp >= nextLevelSettings.xp_required) {
      isLevelUp = true;
      newLevel = user.level + 1;
      user.level = newLevel;
      user.xp_to_next_level = nextLevelSettings.xp_to_next_level;
    } else if (currentLevelSettings) {
      user.xp_to_next_level = currentLevelSettings.xp_to_next_level;
    }

    user.xp = updatedXp;
    await user.save();

    // Создаем запись о транзакции опыта с информацией о повышении уровня
    // Validate sourceType against allowed enum values
    const allowedSourceTypes = ['deposit', 'sell_item', 'withdraw_item', 'exchange_item_for_subscription', 'achievement', 'subscription_purchase', 'bonus_game', 'other'];
    let validatedSourceType = sourceType;
    if (!allowedSourceTypes.includes(sourceType)) {
      validatedSourceType = 'other';
    }

    await db.XpTransaction.create({
      user_id: userId,
      amount,
      source_type: validatedSourceType,
      source_id: sourceId,
      description,
      is_level_up: isLevelUp,
      new_level: newLevel
    });

    // Создание уведомления при повышении уровня и обновление бонусов
    if (isLevelUp) {
      // Обновляем бонус от уровня
      const bonusInfo = await updateLevelBonus(userId, newLevel);

      await db.Notification.create({
        user_id: userId,
        title: 'Повышение уровня',
        message: `Поздравляем! Вы достигли уровня ${newLevel}. Бонус к шансу дорогих предметов: +${bonusInfo.newLevelBonus.toFixed(1)}%`,
        type: 'success',
        category: 'level_up',
        importance: 5,
        data: {
          newLevel: newLevel,
          oldLevelBonus: bonusInfo.oldLevelBonus,
          newLevelBonus: bonusInfo.newLevelBonus,
          totalBonus: bonusInfo.totalBonus
        }
      });
    }

    return { isLevelUp, newLevel };

  } catch (error) {
    console.error('Ошибка при добавлении опыта:', error);
    throw error;
  }
}

module.exports = {
  addExperience
};
