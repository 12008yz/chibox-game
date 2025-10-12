const axios = require('axios');
const { Payment } = require('../models');
const crypto = require('crypto');
const robokassaService = require('./robokassaService');

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const YOOKASSA_CLIENT_SECRET = process.env.YOOKASSA_CLIENT_SECRET;
const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3/payments';

/**
 * Создание платежа через ЮКассу
 */
async function createYooKassaPayment({ amount, description, userId, purpose = 'deposit', metadata = {} }) {
  try {
    console.log('createYooKassaPayment called with:', { amount, description, userId, purpose, metadata });

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
      description: description || `Payment for ${purpose} by user ${userId}`,
      metadata: {
        userId,
        purpose,
        ...metadata
      },
      payment_method_data: {
        type: 'bank_card'
      }
    };

    console.log('Sending payment data to YooKassa:', JSON.stringify(paymentData, null, 2));

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
    console.log('YooKassa response:', JSON.stringify(payment, null, 2));

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
      metadata: metadata
    });

    console.log('Payment record created:', paymentRecord.id);

    return {
      success: true,
      paymentUrl: payment.confirmation ? payment.confirmation.confirmation_url : null,
      paymentId: payment.id
    };
  } catch (error) {
    console.error('Ошибка создания платежа в YooKassa:', error.response ? error.response.data : error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
    return {
      success: false,
      error: error.response ? error.response.data : error.message
    };
  }
}

/**
 * Универсальная функция создания платежа
 * @param {object} params
 * @param {number} params.amount
 * @param {string} params.description
 * @param {number} params.userId
 * @param {string} params.purpose
 * @param {object} params.metadata
 * @param {string} params.paymentMethod - 'yookassa' или 'robokassa'
 */
async function createPayment({ amount, description, userId, purpose = 'deposit', metadata = {}, paymentMethod = 'yookassa' }) {
  console.log(`Creating payment with method: ${paymentMethod}`);

  if (paymentMethod === 'robokassa') {
    return await robokassaService.createPayment({ amount, description, userId, purpose, metadata });
  } else {
    return await createYooKassaPayment({ amount, description, userId, purpose, metadata });
  }
}

module.exports = {
  createPayment,
  createYooKassaPayment
};
