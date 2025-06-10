const db = require('../models');

/**
 * Рассчитывает бонус от уровня пользователя
 * @param {number} level - Уровень пользователя
 * @returns {number} Бонус в процентах
 */
function calculateLevelBonus(level) {
    if (level <= 1) return 0;

    // Бонус от уровня: 0.02% за каждый уровень свыше 1-го
    // Максимальный бонус от уровня: 2% на 100 уровне
    const levelBonus = (level - 1) * 0.02;
    return Math.min(levelBonus, 2.0); // Максимум 2%
}

/**
 * Рассчитывает бонус от подписки
 * @param {number} subscriptionTier - Уровень подписки (0-3)
 * @returns {number} Бонус в процентах
 */
function calculateSubscriptionBonus(subscriptionTier) {
    const subscriptionBonuses = {
        0: 0,    // Нет подписки
        1: 3.0,  // Статус: +3%
        2: 5.0,  // Статус+: +5%
        3: 8.0   // Статус++: +8% + защита от дубликатов
    };

    return subscriptionBonuses[subscriptionTier] || 0;
}

/**
 * Обновляет все бонусы пользователя
 * @param {string} userId - ID пользователя
 * @returns {Object} Информация об обновленных бонусах
 */
async function updateUserBonuses(userId) {
    const user = await db.User.findByPk(userId);
    if (!user) {
        throw new Error('Пользователь не найден');
    }

    // Рассчитываем бонус от уровня
    const levelBonus = calculateLevelBonus(user.level || 1);
    user.level_bonus_percentage = levelBonus;

    // Рассчитываем бонус от подписки
    const subscriptionBonus = calculateSubscriptionBonus(user.subscription_tier || 0);
    user.subscription_bonus_percentage = subscriptionBonus;

    // Бонус от достижений уже должен быть установлен в achievementService
    // Ограничиваем максимальный бонус от достижений до 5%
    const achievementsBonus = Math.min(user.achievements_bonus_percentage || 0, 5.0);

    // Рассчитываем общий бонус (максимум 15%)
    const totalBonus = Math.min(achievementsBonus + levelBonus + subscriptionBonus, 15.0);
    user.total_drop_bonus_percentage = totalBonus;

    await user.save();

    return {
        userId,
        achievementsBonus,
        levelBonus,
        subscriptionBonus,
        totalBonus,
        level: user.level,
        subscriptionTier: user.subscription_tier
    };
}

/**
 * Обновляет только бонус от уровня (при повышении уровня)
 * @param {string} userId - ID пользователя
 * @param {number} newLevel - Новый уровень
 * @returns {Object} Информация об обновленных бонусах
 */
async function updateLevelBonus(userId, newLevel) {
    const user = await db.User.findByPk(userId);
    if (!user) {
        throw new Error('Пользователь не найден');
    }

    const oldLevelBonus = user.level_bonus_percentage || 0;
    const newLevelBonus = calculateLevelBonus(newLevel);

    user.level = newLevel;
    user.level_bonus_percentage = newLevelBonus;

    // Пересчитываем общий бонус с ограничениями
    const achievementsBonus = Math.min(user.achievements_bonus_percentage || 0, 5.0);
    user.total_drop_bonus_percentage = Math.min(
        achievementsBonus + newLevelBonus + (user.subscription_bonus_percentage || 0),
        15.0
    );

    await user.save();

    return {
        userId,
        oldLevel: user.level,
        newLevel,
        oldLevelBonus,
        newLevelBonus,
        bonusDifference: newLevelBonus - oldLevelBonus,
        totalBonus: user.total_drop_bonus_percentage
    };
}

/**
 * Обновляет бонус от подписки
 * @param {string} userId - ID пользователя
 * @param {number} subscriptionTier - Новый уровень подписки
 * @returns {Object} Информация об обновленных бонусах
 */
async function updateSubscriptionBonus(userId, subscriptionTier) {
    const user = await db.User.findByPk(userId);
    if (!user) {
        throw new Error('Пользователь не найден');
    }

    const oldSubscriptionBonus = user.subscription_bonus_percentage || 0;
    const newSubscriptionBonus = calculateSubscriptionBonus(subscriptionTier);

    user.subscription_tier = subscriptionTier;
    user.subscription_bonus_percentage = newSubscriptionBonus;

    // Пересчитываем общий бонус с ограничениями
    const achievementsBonus = Math.min(user.achievements_bonus_percentage || 0, 5.0);
    user.total_drop_bonus_percentage = Math.min(
        achievementsBonus + (user.level_bonus_percentage || 0) + newSubscriptionBonus,
        15.0
    );

    await user.save();

    return {
        userId,
        oldSubscriptionTier: user.subscription_tier,
        newSubscriptionTier: subscriptionTier,
        oldSubscriptionBonus,
        newSubscriptionBonus,
        bonusDifference: newSubscriptionBonus - oldSubscriptionBonus,
        totalBonus: user.total_drop_bonus_percentage
    };
}

/**
 * Получает полную информацию о бонусах пользователя
 * @param {string} userId - ID пользователя
 * @returns {Object} Детальная информация о всех бонусах
 */
async function getUserBonusInfo(userId) {
    const user = await db.User.findByPk(userId);
    if (!user) {
        throw new Error('Пользователь не найден');
    }

    return {
        userId,
        level: user.level,
        subscriptionTier: user.subscription_tier,
        achievementsBonus: user.achievements_bonus_percentage || 0,
        levelBonus: user.level_bonus_percentage || 0,
        subscriptionBonus: user.subscription_bonus_percentage || 0,
        totalBonus: user.total_drop_bonus_percentage || 0,
        bonusBreakdown: {
            achievements: `+${(user.achievements_bonus_percentage || 0).toFixed(1)}%`,
            level: `+${(user.level_bonus_percentage || 0).toFixed(1)}%`,
            subscription: `+${(user.subscription_bonus_percentage || 0).toFixed(1)}%`,
            total: `+${(user.total_drop_bonus_percentage || 0).toFixed(1)}%`
        }
    };
}

module.exports = {
    calculateLevelBonus,
    calculateSubscriptionBonus,
    updateUserBonuses,
    updateLevelBonus,
    updateSubscriptionBonus,
    getUserBonusInfo
};