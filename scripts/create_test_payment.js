const db = require('../models');
const { v4: uuidv4 } = require('uuid');

async function createTestPayment() {
  try {
    const payment = await db.Payment.create({
      id: uuidv4(),
      user_id: '7ab34e85-f503-49a4-bbb3-b33b869c7bd9', // замените на существующий user_id в вашей базе
      amount: 1210,
      payment_system: 'ukassa',
      status: 'pending',
      payment_id: 'test_payment_id_5',
      purpose: 'subscription',
      description: 'Тестовый платеж для webhook',
      subscription_tier_id: 1,
      is_test: true
    });
    console.log('Тестовый платеж создан:', payment.id);
  } catch (error) {
    console.error('Ошибка создания тестового платежа:', error);
  }
}

createTestPayment();
