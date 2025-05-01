const db = require('../models');
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
 * Обработчик webhook от YooMoney
 * Ожидает POST запрос с данными платежа
 */
async function yoomoneyWebhook(req, res) {
  try {
    const data = req.body;

    // TODO: Проверить подпись webhook, если требуется YooMoney

    // Проверяем статус платежа
    if (data.status !== 'succeeded') {
      logger.info(`Платеж не завершён: ${data.status}`);
      return res.status(200).send('OK');
    }

    // Ищем платеж в базе по payment_id (id платежа YooMoney)
    const payment = await db.Payment.findOne({ where: { external_id: data.id } });
    if (!payment) {
      logger.error(`Платеж с external_id ${data.id} не найден`);
      return res.status(404).send('Payment not found');
    }

    if (payment.status === 'completed') {
      logger.info(`Платеж ${data.id} уже обработан`);
      return res.status(200).send('OK');
    }

    // Обновляем статус платежа
    payment.status = 'completed';
    await payment.save();

    // Активируем подписку пользователя
    const user = await db.User.findByPk(payment.user_id);
    if (!user) {
      logger.error(`Пользователь с id ${payment.user_id} не найден`);
      return res.status(404).send('User not found');
    }

    const tierId = payment.subscription_tier_id;
    const subscriptionTiers = {
      1: { days: 30, max_daily_cases: 3, bonus_percentage: 3.0, name: 'Статус' },
      2: { days: 30, max_daily_cases: 5, bonus_percentage: 5.0, name: 'Статус+' },
      3: { days: 30, max_daily_cases: 10, bonus_percentage: 10.0, name: 'Статус++' }
    };
    const tier = subscriptionTiers[tierId];
    if (!tier) {
      logger.error(`Тариф ${tierId} не найден`);
      return res.status(400).send('Invalid subscription tier');
    }

    const now = new Date();
    if (user.subscription_tier && user.subscription_expiry_date && user.subscription_expiry_date > now && user.subscription_tier === tierId) {
      user.subscription_expiry_date = new Date(Math.max(now, user.subscription_expiry_date));
      user.subscription_expiry_date.setDate(user.subscription_expiry_date.getDate() + tier.days);
    } else {
      user.subscription_tier = tierId;
      user.subscription_purchase_date = now;
      user.subscription_expiry_date = new Date(now.getTime() + tier.days * 86400000);
    }

    user.max_daily_cases = 1;
    user.subscription_bonus_percentage = tier.bonus_percentage;
    user.cases_available = Math.max(user.cases_available || 0, 1);
    await user.save();

    await db.SubscriptionHistory.create({
      user_id: user.id,
      action: 'purchase',
      days: tier.days,
      price: payment.amount,
      item_id: null,
      method: 'card',
      date: now
    });

    logger.info(`Подписка активирована для пользователя ${user.id} по платежу ${payment.id}`);

    return res.status(200).send('OK');
  } catch (error) {
    logger.error('Ошибка обработки webhook YooMoney:', error);
    return res.status(500).send('Internal Server Error');
  }
}

module.exports = {
  yoomoneyWebhook
};
