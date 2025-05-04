const { v4: uuidv4 } = require('uuid');
const db = require('../models');

async function createTestPayment(paymentId, userId, amount = 1200.00) {
  try {
    // Check if payment with paymentId already exists
    const existingPayment = await db.Payment.findOne({ where: { payment_id: paymentId } });
    if (existingPayment) {
      console.log(`Payment with payment_id ${paymentId} already exists.`);
      return existingPayment;
    }

    // Create new payment
    const payment = await db.Payment.create({
      id: uuidv4(),
      user_id: userId,
      amount: amount,
      payment_system: 'ukassa', // valid enum value
      status: 'created',
      payment_id: paymentId,
      purpose: 'deposit',
      subscription_tier_id: 1,
      is_test: true
    });

    console.log(`Created test payment with payment_id ${paymentId}`);
    return payment;
  } catch (error) {
    console.error('Error creating test payment:', error);
    throw error;
  }
}

// Example usage:
const testUserId = '8d9a4f55-3e18-40da-bdfd-0f42cdc52608';
const testPaymentId = 'test_payment_id_1';

createTestPayment(testPaymentId, testUserId)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
