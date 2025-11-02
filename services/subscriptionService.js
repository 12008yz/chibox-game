const db = require('../models');
const { giveDailyCaseToUser } = require('./caseService');
const { updateUserAchievementProgress } = require('./achievementService');
const { updateSubscriptionBonus } = require('../utils/userBonusCalculator');
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
 * Активирует подписку для пользователя
 * @param {number} userId - ID пользователя
 * @param {number} tierId - ID тарифа подписки
 */
async function activateSubscription(userId, tierId, promoExtendDays = 0) {
  try {
    const subscriptionTiers = {
      1: { days: 30, max_daily_cases: 1, bonus_percentage: 2.0, name: 'Статус', price: 1811 },
      2: { days: 30, max_daily_cases: 1, bonus_percentage: 3.0, name: 'Статус+', price: 3666 },
      3: { days: 30, max_daily_cases: 1, bonus_percentage: 5.0, name: 'Статус++', price: 7580 }
    };

    const tier = subscriptionTiers[tierId];
    if (!tier) {
      logger.warn(`Subscription tier not found: ${tierId}`);
      throw new Error('Subscription tier not found');
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      logger.warn(`User not found: ${userId}`);
      throw new Error('User not found');
    }

    const now = new Date();
    const totalDays = tier.days + promoExtendDays;
    if (user.subscription_tier && user.subscription_expiry_date && user.subscription_expiry_date > now && user.subscription_tier === tierId) {
      user.subscription_expiry_date = new Date(Math.max(now, user.subscription_expiry_date));
      user.subscription_expiry_date.setDate(user.subscription_expiry_date.getDate() + totalDays);
    } else {
      user.subscription_tier = tierId;
      user.subscription_purchase_date = now;
      user.subscription_expiry_date = new Date(now.getTime() + totalDays * 86400000);
    }

    user.max_daily_cases = tier.max_daily_cases;
    user.cases_available = Math.max(user.cases_available || 0, 1);

    await user.save();

    // Обновляем бонус от подписки и пересчитываем общий бонус
    await updateSubscriptionBonus(userId, tierId);

    // Обновляем поле subscription_days_left
    const msLeft = user.subscription_expiry_date.getTime() - new Date().getTime();
    user.subscription_days_left = msLeft > 0 ? Math.floor(msLeft / 86400000) : 0;
    await user.save();

    // Update achievement progress for subscription days
    await updateUserAchievementProgress(userId, 'subscription_days', 1);

    // Update achievement progress for subscription purchased
    await updateUserAchievementProgress(userId, 'subscription_purchased', 1);

    // Give daily case to user
    await giveDailyCaseToUser(userId, tierId);

    // Устанавливаем время следующего получения кейсов
    const { getNextDailyCaseTime } = require('../utils/cronHelper');
    const nextCaseTime = getNextDailyCaseTime();
    user.next_case_available_time = nextCaseTime;
    await user.save();

    await db.SubscriptionHistory.create({
      user_id: userId,
      action: 'purchase',
      days: totalDays,
      price: tier.price,
      item_id: null,
      method: 'webhook',
      date: now
    });

    logger.info(`User ${userId} subscription activated for tier ${tierId}`);

    // Проверяем окончание подписки и создаем уведомление, если подписка истекла
    if (user.subscription_expiry_date && user.subscription_expiry_date <= now) {
      await db.Notification.create({
        user_id: userId,
        title: 'Окончание подписки',
        message: 'Ваш статус истекл. Продлите её, чтобы продолжить пользоваться преимуществами.',
        type: 'warning',
        category: 'subscription',
        importance: 7,
        link: '/subscription'
      });
    }
  } catch (error) {
    logger.error('Error activating subscription:', error);
    throw error;
  }
}

module.exports = {
  activateSubscription
};
