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
    user.xp = updatedXp;

    // Проверяем повышение уровня в цикле (может быть несколько уровней сразу)
    let currentLevel = user.level;
    let shouldContinue = true;

    while (shouldContinue) {
      const nextLevelSettings = await db.LevelSettings.findOne({
        where: { level: currentLevel + 1 }
      });

      // Проверяем, достиг ли пользователь порога для повышения уровня
      if (nextLevelSettings && updatedXp >= nextLevelSettings.xp_required) {
        currentLevel++;
        isLevelUp = true;
        newLevel = currentLevel;
      } else {
        shouldContinue = false;
      }
    }

    // Обновляем уровень пользователя, если произошло повышение
    if (isLevelUp) {
      user.level = newLevel;
      const newLevelSettings = await db.LevelSettings.findOne({
        where: { level: newLevel }
      });
      if (newLevelSettings) {
        user.xp_to_next_level = newLevelSettings.xp_to_next_level;
      }
    } else {
      // Обновляем xp_to_next_level для текущего уровня
      const currentLevelSettings = await db.LevelSettings.findOne({
        where: { level: user.level }
      });
      if (currentLevelSettings) {
        user.xp_to_next_level = currentLevelSettings.xp_to_next_level;
      }
    }

    await user.save();

    // Создаем запись о транзакции опыта с информацией о повышении уровня
    // Validate sourceType against allowed enum values
    const allowedSourceTypes = ['case_open', 'case_opening', 'achievement', 'daily_login', 'battle_win', 'purchase', 'referral', 'admin', 'event', 'buy_case', 'buy_subscription', 'sell_item', 'upgrade_success', 'upgrade_fail', 'withdraw_item', 'deposit', 'other'];
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
        message: `Поздравляем! Вы достигли уровня ${newLevel}. Бонус к шансу дорогих предметов: +${bonusInfo.newLevelBonus.toFixed(2)}%`,
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
