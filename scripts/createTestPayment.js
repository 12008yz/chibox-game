const { v4: uuidv4 } = require('uuid');
const db = require('../models');

async function createTestPayment(paymentId, userId, amount = 1500.00) {
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
      subscription_tier_id: 2,
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
const testUserId = '39addfc0-88fe-47fc-b5aa-ea43737e4ca8';
const testPaymentId = 'test_payment_id_5';

createTestPayment(testPaymentId, testUserId)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
