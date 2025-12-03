const db = require('../models');

/**
 * Рассчитывает бонус от уровня пользователя
 * @param {number} level - Уровень пользователя
 * @returns {number} Бонус в процентах
 */
function calculateLevelBonus(level) {
    // Бонус от уровня: 0.02% за каждый уровень
    // Максимальный бонус от уровня: 2% на 100 уровне
    const levelBonus = level * 0.02;
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
        1: 2.0,  // Статус: +2% (снижено с 3%)
        2: 3.0,  // Статус+: +3% (снижено с 5%)
        3: 5.0   // Статус++: +5% (снижено с 8%) + защита от дубликатов
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

    // Проверяем актуальность подписки перед расчётом бонуса
    const now = new Date();
    let subscriptionTier = user.subscription_tier || 0;

    // Если подписка истекла, сбрасываем её
    if (user.subscription_expiry_date && user.subscription_expiry_date <= now && subscriptionTier > 0) {
        subscriptionTier = 0;
        user.subscription_tier = 0;
        user.subscription_days_left = 0;
        user.max_daily_cases = 0;
        user.cases_available = 0;
    }

    // Рассчитываем бонус от подписки
    const subscriptionBonus = calculateSubscriptionBonus(subscriptionTier);
    user.subscription_bonus_percentage = subscriptionBonus;

    // Бонус от достижений уже должен быть установлен в achievementService
    // Ограничиваем максимальный бонус от достижений до 17%
    const achievementsBonus = Math.min(user.achievements_bonus_percentage || 0, 17.0);

    // Рассчитываем общий бонус (максимум 25%)
    const totalBonus = Math.min(achievementsBonus + levelBonus + subscriptionBonus, 25.0);
    user.total_drop_bonus_percentage = totalBonus;

    await user.save();

    return {
        userId,
        achievementsBonus,
        levelBonus,
        subscriptionBonus,
        totalBonus,
        level: user.level,
        subscriptionTier
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
    const achievementsBonus = Math.min(user.achievements_bonus_percentage || 0, 17.0);
    user.total_drop_bonus_percentage = Math.min(
        achievementsBonus + newLevelBonus + (user.subscription_bonus_percentage || 0),
        25.0
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
    const achievementsBonus = Math.min(user.achievements_bonus_percentage || 0, 17.0);
    user.total_drop_bonus_percentage = Math.min(
        achievementsBonus + (user.level_bonus_percentage || 0) + newSubscriptionBonus,
        25.0
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

    // Проверяем, не истекла ли подписка
    const now = new Date();
    let subscriptionBonus = user.subscription_bonus_percentage || 0;
    let subscriptionTier = user.subscription_tier || 0;

    // Если есть дата истечения и она в прошлом, сбрасываем бонус подписки
    if (user.subscription_expiry_date && user.subscription_expiry_date <= now) {
        subscriptionBonus = 0;
        subscriptionTier = 0;

        // Если бонус в БД не обнулён, обновляем его
        if (user.subscription_bonus_percentage > 0 || user.subscription_tier > 0) {
            await user.update({
                subscription_tier: 0,
                subscription_bonus_percentage: 0,
                subscription_days_left: 0,
                max_daily_cases: 0,
                cases_available: 0
            });

            // Пересчитываем total_drop_bonus_percentage
            const achievementsBonus = Math.min(user.achievements_bonus_percentage || 0, 17.0);
            const levelBonus = user.level_bonus_percentage || 0;
            user.total_drop_bonus_percentage = Math.min(
                achievementsBonus + levelBonus,
                25.0
            );
            await user.save();
            // Перезагружаем объект user после обновления
            await user.reload();
        }
    }

    // Вычисляем актуальный totalBonus с учетом обновлений
    const actualTotalBonus = user.total_drop_bonus_percentage || 0;

    return {
        userId,
        level: user.level,
        subscriptionTier,
        achievementsBonus: user.achievements_bonus_percentage || 0,
        levelBonus: user.level_bonus_percentage || 0,
        subscriptionBonus,
        totalBonus: actualTotalBonus,
        bonusBreakdown: {
            achievements: `+${(user.achievements_bonus_percentage || 0).toFixed(2)}%`,
            level: `+${(user.level_bonus_percentage || 0).toFixed(2)}%`,
            subscription: `+${subscriptionBonus.toFixed(2)}%`,
            total: `+${actualTotalBonus.toFixed(2)}%`
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
