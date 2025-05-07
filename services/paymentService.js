const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = require('../models');

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3/payments';
const YOOKASSA_CLIENT_SECRET = process.env.YOOKASSA_CLIENT_SECRET;
const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const YOOKASSA_RETURN_URL = process.env.YOOKASSA_RETURN_URL;

function truncateDescription(description) {
  if (description.length > 128) {
    return description.substring(0, 125) + '...';
  }
  return description;
}

/**
 * Создаёт локальный платёж в базе данных
 * @param {number} amount - сумма платежа
 * @param {string} userId - ID пользователя
 * @param {string} purpose - назначение платежа ('deposit', 'subscription', 'case_purchase', 'bonus', и т.д.)
 * @param {object} options - дополнительные параметры (subscriptionTier, promoCode, paymentSystem, status и др.)
 * @returns {Promise<object>} - созданный платёж
 */
async function createLocalPayment(amount, userId, purpose, options = {}) {
  const {
    subscriptionTier = null,
    promoCode = null,
    paymentSystem = 'ukassa',
    status = 'created',
    description = null,
    paymentId = null,
    paymentUrl = null,
    isTest = false
  } = options;

  try {
    const paymentIdToUse = paymentId || uuidv4();

    // Check if payment with paymentId already exists
    const existingPayment = await db.Payment.findOne({ where: { payment_id: paymentIdToUse } });
    if (existingPayment) {
      return existingPayment;
    }

    const payment = await db.Payment.create({
      id: uuidv4(),
      user_id: userId,
      amount,
      payment_system: paymentSystem,
      status,
      payment_id: paymentIdToUse,
      purpose,
      description,
      promo_code: promoCode,
      subscription_tier_id: subscriptionTier,
      is_test: isTest,
      payment_url: paymentUrl
    });
    return payment;
  } catch (error) {
    throw new Error(`Ошибка создания локального платежа: ${error.message}`);
  }
}

/**
 * Создаёт платёж в YooKassa и локальную запись в базе
 * @param {number} amount - сумма платежа
 * @param {string} userId - ID пользователя
 * @param {string} subscriptionTier - ID тарифа подписки
 * @param {object} options - дополнительные параметры (promoCode и др.)
 * @returns {Promise<string>} - ссылка на оплату
 */
async function createOnlinePayment(amount, userId, subscriptionTier, options = {}) {
  try {
    const description = truncateDescription(`Оплата подписки Chibox - tier ${subscriptionTier} пользователем ${userId}`);

    const authString = `${YOOKASSA_SHOP_ID}:${YOOKASSA_CLIENT_SECRET}`;
    const encodedAuth = Buffer.from(authString, 'utf-8').toString('base64');

    const response = await axios.post(YOOKASSA_API_URL, {
      amount: {
        value: amount.toFixed(2),
        currency: 'RUB'
      },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: YOOKASSA_RETURN_URL
      },
      description,
      metadata: {
        userId,
        subscriptionTier
      }
    }, {
      headers: {
        'Authorization': `Basic ${encodedAuth}`,
        'Idempotence-Key': `${userId}-${Date.now()}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.confirmation && response.data.confirmation.confirmation_url) {
      // Создаём локальный платёж с payment_id из YooKassa
      await createLocalPayment(amount, userId, 'subscription', {
        subscriptionTier,
        paymentSystem: 'ukassa',
        status: 'pending',
        paymentId: response.data.id,
        paymentUrl: response.data.confirmation.confirmation_url,
        description
      });
      return response.data.confirmation.confirmation_url;
    } else {
      throw new Error('Не удалось получить ссылку на оплату от YooKassa');
    }
  } catch (error) {
    throw new Error(`Ошибка создания платежа в YooKassa: ${error.message}`);
  }
}

module.exports = {
  createLocalPayment,
  createOnlinePayment
};
