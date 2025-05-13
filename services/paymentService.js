const axios = require('axios');
const { Payment } = require('../models');
const crypto = require('crypto');

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const YOOKASSA_CLIENT_SECRET = process.env.YOOKASSA_CLIENT_SECRET;
const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3/payments';

async function createPayment(amount, userId, purpose = 'deposit', extraData = {}) {
  try {
    const idempotenceKey = crypto.randomUUID();

    const paymentData = {
      amount: {
        value: amount.toFixed(2),
        currency: 'RUB'
      },
      confirmation: {
        type: 'redirect',
        return_url: process.env.YOOKASSA_RETURN_URL || 'https://your-return-url.example.com'
      },
      capture: true,
      description: `Payment for ${purpose} by user ${userId}`,
      metadata: {
        userId,
        purpose,
        ...extraData
      },
      payment_method_data: {
        type: 'bank_card'
      }
    };

    const response = await axios.post(YOOKASSA_API_URL, paymentData, {
      auth: {
        username: YOOKASSA_SHOP_ID,
        password: YOOKASSA_CLIENT_SECRET
      },
      headers: {
        'Idempotence-Key': idempotenceKey,
        'Content-Type': 'application/json'
      }
    });

    const payment = response.data;

    // Сохраняем платеж в БД
    const paymentRecord = await Payment.create({
      user_id: userId,
      amount: amount,
      payment_system: 'ukassa',
      status: payment.status,
      payment_id: payment.id,
      payment_url: payment.confirmation ? payment.confirmation.confirmation_url : null,
      description: payment.description,
      purpose: purpose,
      webhook_received: false,
      is_test: process.env.NODE_ENV !== 'production',
      currency: payment.amount.currency,
      payment_method: payment.payment_method_data ? payment.payment_method_data.type : null,
      payment_details: payment,
      metadata: {
        ...extraData
      }
    });

    return paymentRecord.payment_url;
  } catch (error) {
    console.error('Ошибка создания платежа в YooKassa:', error.response ? error.response.data : error.message);
    throw new Error('Ошибка создания платежа в YooKassa');
  }
}

module.exports = {
  createPayment
};
