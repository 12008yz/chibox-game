const crypto = require('crypto');
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
 * Проверка подписи webhook от YooKassa
 * @param {string} body - тело запроса в виде строки
 * @param {string} signature - заголовок 'X-Request-Signature-SHA256'
 * @param {string} secretKey - секретный ключ из настроек YooKassa
 * @returns {boolean} - true если подпись валидна, иначе false
 */
function verifyWebhookSignature(body, signature, secretKey) {
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(body);
  const digest = hmac.digest('base64');
  console.log('Computed signature:', digest);
  console.log('Received signature:', signature);
  console.log('Secret key (masked):', secretKey ? secretKey.substring(0, 4) + '...' : 'undefined');
  return digest === signature;
}

/**
 * Обработчик webhook от YooKassa
 * Ожидает POST запрос с данными платежа
 */
async function yoomoneyWebhook(req, res) {
  try {
    const signature = req.headers['x-request-signature-sha256'];
    const secretKey = process.env.YOOKASSA_CLIENT_SECRET;
    const bodyString = req.rawBody || JSON.stringify(req.body);

    if (!verifyWebhookSignature(bodyString, signature, secretKey)) {
      logger.error('Неверная подпись webhook YooKassa');
      return res.status(400).send('Invalid signature');
    }

    const data = req.body;

    // Проверяем статус платежа
    if (data.status !== 'succeeded') {
      logger.info(`Платеж не завершён: ${data.status}`);
      return res.status(200).send('OK');
    }

    // Ищем платеж в базе по payment_id (id платежа YooKassa)
    const payment = await db.Payment.findOne({ where: { payment_id: data.id } });
    if (!payment) {
      logger.error(`Платеж с payment_id ${data.id} не найден`);
      return res.status(404).send('Payment not found');
    }

    if (payment.status === 'completed') {
      logger.info(`Платеж ${data.id} уже обработан`);
      return res.status(200).send('OK');
    }

    // Обновляем статус платежа
    payment.status = 'completed';
    payment.webhook_received = true;
    payment.webhook_data = data;
    payment.completed_at = new Date();
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
    logger.error('Ошибка обработки webhook YooKassa:', error);
    return res.status(500).send('Internal Server Error');
  }
}

module.exports = {
  yoomoneyWebhook
};
