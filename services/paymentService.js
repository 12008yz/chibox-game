const { Payment } = require('../models');
const unitpayService = require('./unitpayService');

/**
 * Создание платежа (только UnitPay).
 * @param {object} params
 * @param {number} params.amount
 * @param {string} params.description
 * @param {number} params.userId
 * @param {string} params.purpose
 * @param {object} params.metadata
 * @param {string} params.paymentMethod - игнорируется, всегда 'unitpay'
 */
async function createPayment({ amount, description, userId, purpose = 'deposit', metadata = {}, paymentMethod = 'unitpay' }) {
  const unitpaySystem = metadata?.unitpay_system || null;
  return await unitpayService.createPayment({
    amount,
    description,
    userId,
    purpose,
    metadata,
    systemCode: unitpaySystem
  });
}

module.exports = {
  createPayment
};
