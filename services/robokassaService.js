const crypto = require('crypto');
const { Payment } = require('../models');

const ROBOKASSA_MERCHANT_LOGIN = process.env.ROBOKASSA_MERCHANT_LOGIN || 'Test1999';
const ROBOKASSA_PASSWORD1 = process.env.ROBOKASSA_PASSWORD1 || 'password_1';
const ROBOKASSA_PASSWORD2 = process.env.ROBOKASSA_PASSWORD2 || 'password_2';
const ROBOKASSA_TEST_MODE = process.env.ROBOKASSA_TEST_MODE === 'true';
const ROBOKASSA_PAYMENT_URL = 'https://auth.robokassa.ru/Merchant/Index.aspx';

/**
 * Генерация MD5 подписи для Robokassa
 * @param {string} merchantLogin
 * @param {number} outSum
 * @param {number} invId
 * @param {string} password
 * @param {object} customParams - дополнительные параметры в формате {key: value}
 * @returns {string}
 */
function generateSignature(merchantLogin, outSum, invId, password, customParams = {}) {
  // Формируем строку для подписи
  // MerchantLogin:OutSum:InvId:Password[:Shp_param1=value1:Shp_param2=value2...]

  // Сортируем кастомные параметры по ключу
  const sortedParams = Object.keys(customParams)
    .sort()
    .map(key => `Shp_${key}=${customParams[key]}`)
    .join(':');

  const signatureString = sortedParams
    ? `${merchantLogin}:${outSum}:${invId}:${password}:${sortedParams}`
    : `${merchantLogin}:${outSum}:${invId}:${password}`;

  console.log('Signature string:', signatureString);

  return crypto.createHash('md5').update(signatureString).digest('hex');
}

/**
 * Проверка подписи ResultURL (используется Password2)
 * @param {number} outSum
 * @param {number} invId
 * @param {string} receivedSignature
 * @param {object} customParams
 * @returns {boolean}
 */
function verifyResultSignature(outSum, invId, receivedSignature, customParams = {}) {
  const sortedParams = Object.keys(customParams)
    .filter(key => key.startsWith('shp_'))
    .sort()
    .map(key => `${key}=${customParams[key]}`)
    .join(':');

  const signatureString = sortedParams
    ? `${outSum}:${invId}:${ROBOKASSA_PASSWORD2}:${sortedParams}`
    : `${outSum}:${invId}:${ROBOKASSA_PASSWORD2}`;

  const calculatedSignature = crypto.createHash('md5').update(signatureString).digest('hex').toLowerCase();

  console.log('Verify Result Signature:', {
    signatureString,
    calculated: calculatedSignature,
    received: receivedSignature.toLowerCase()
  });

  return calculatedSignature === receivedSignature.toLowerCase();
}

/**
 * Создание платежа в Robokassa
 * @param {object} params
 * @param {number} params.amount - сумма в рублях
 * @param {string} params.description - описание платежа
 * @param {number} params.userId - ID пользователя
 * @param {string} params.purpose - цель платежа (deposit, subscription)
 * @param {object} params.metadata - дополнительные данные
 * @returns {Promise<object>}
 */
async function createPayment({ amount, description, userId, purpose = 'deposit', metadata = {} }) {
  try {
    console.log('Robokassa createPayment called with:', { amount, description, userId, purpose, metadata });

    // Создаем запись в БД для получения ID
    const paymentRecord = await Payment.create({
      user_id: userId,
      amount: amount,
      payment_system: 'robokassa',
      status: 'pending',
      payment_id: null, // Будет обновлен после подтверждения
      payment_url: null,
      description: description,
      purpose: purpose,
      webhook_received: false,
      is_test: ROBOKASSA_TEST_MODE,
      currency: 'RUB',
      payment_method: 'robokassa',
      payment_details: {},
      metadata: metadata
    });

    // Перезагружаем запись для получения автоинкрементного invoice_number
    await paymentRecord.reload();

    // Проверяем, что invoice_number создался
    if (!paymentRecord.invoice_number) {
      throw new Error('Failed to generate invoice_number');
    }

    const invId = paymentRecord.invoice_number;
    const outSum = amount.toFixed(2);

    // Формируем custom параметры (Shp_)
    // ВАЖНО: ключи должны быть строчными для правильной сортировки
    const customParams = {
      userId: userId.toString(),
      purpose: purpose
    };

    // Добавляем metadata в custom параметры
    Object.keys(metadata).forEach(key => {
      customParams[key] = metadata[key].toString();
    });

    console.log('Custom params before signature:', customParams);

    // Генерируем подпись с Password1
    const signature = generateSignature(
      ROBOKASSA_MERCHANT_LOGIN,
      outSum,
      invId,
      ROBOKASSA_PASSWORD1,
      customParams
    );

    console.log('Generated signature:', signature);

    // Формируем URL для оплаты
    const params = new URLSearchParams({
      MerchantLogin: ROBOKASSA_MERCHANT_LOGIN,
      OutSum: outSum,
      InvId: invId.toString(),
      Description: description,
      SignatureValue: signature,
      IsTest: ROBOKASSA_TEST_MODE ? '1' : '0',
      Culture: 'ru',
      Encoding: 'utf-8'
    });

    // Добавляем custom параметры
    Object.keys(customParams).forEach(key => {
      params.append(`Shp_${key}`, customParams[key].toString());
    });

    const paymentUrl = `${ROBOKASSA_PAYMENT_URL}?${params.toString()}`;

    // Обновляем запись платежа
    paymentRecord.payment_url = paymentUrl;
    paymentRecord.payment_details = {
      merchantLogin: ROBOKASSA_MERCHANT_LOGIN,
      invId: invId,
      outSum: outSum,
      signature: signature,
      isTest: ROBOKASSA_TEST_MODE
    };
    await paymentRecord.save();

    console.log('Robokassa payment created:', {
      paymentId: invId,
      paymentUrl: paymentUrl,
      isTest: ROBOKASSA_TEST_MODE
    });

    return {
      success: true,
      paymentUrl: paymentUrl,
      paymentId: invId
    };
  } catch (error) {
    console.error('Ошибка создания платежа в Robokassa:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  createPayment,
  verifyResultSignature,
  generateSignature
};
