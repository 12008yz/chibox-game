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
 * @param {string} receipt - JSON строка с данными чека (опционально)
 * @param {object} customParams - дополнительные параметры в формате {key: value}
 * @returns {string}
 */
function generateSignature(merchantLogin, outSum, invId, password, receipt = null, customParams = {}) {
  // Формируем строку для подписи
  // Если есть Receipt: MerchantLogin:OutSum:InvId:Receipt:Password[:Shp_param1=value1:Shp_param2=value2...]
  // Без Receipt: MerchantLogin:OutSum:InvId:Password[:Shp_param1=value1:Shp_param2=value2...]

  // Сортируем кастомные параметры по ключу
  const sortedParams = Object.keys(customParams)
    .sort()
    .map(key => `Shp_${key}=${customParams[key]}`)
    .join(':');

  let signatureString;
  if (receipt) {
    // С Receipt
    signatureString = sortedParams
      ? `${merchantLogin}:${outSum}:${invId}:${receipt}:${password}:${sortedParams}`
      : `${merchantLogin}:${outSum}:${invId}:${receipt}:${password}`;
  } else {
    // Без Receipt (старый формат)
    signatureString = sortedParams
      ? `${merchantLogin}:${outSum}:${invId}:${password}:${sortedParams}`
      : `${merchantLogin}:${outSum}:${invId}:${password}`;
  }

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
  // Извлекаем и сортируем только shp_ параметры
  const shpParams = Object.keys(customParams)
    .filter(key => key.toLowerCase().startsWith('shp_'))
    .sort()
    .map(key => `${key}=${customParams[key]}`)
    .join(':');

  // Формируем строку для подписи: OutSum:InvId:Password2[:Shp_params]
  const signatureString = shpParams
    ? `${outSum}:${invId}:${ROBOKASSA_PASSWORD2}:${shpParams}`
    : `${outSum}:${invId}:${ROBOKASSA_PASSWORD2}`;

  const calculatedSignature = crypto.createHash('md5').update(signatureString).digest('hex').toLowerCase();

  console.log('Verify Result Signature:', {
    outSum,
    invId,
    shpParams,
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
    // ВАЖНО: используем ТОЛЬКО необходимые параметры для упрощения отладки
    // Все данные уже сохранены в БД в таблице payments
    const customParams = {
      user_id: userId.toString(),
      purpose: purpose
    };

    // Добавляем только chicoins из metadata (если есть)
    if (metadata.chicoins) {
      customParams.chicoins = metadata.chicoins.toString();
    }

    console.log('Custom params before signature:', customParams);

    // Формируем массив Receipt для фискализации
    const receipt = {
      sno: "osn", // Общая система налогообложения
      items: [
        {
          name: description.substring(0, 128), // Ограничение 128 символов
          quantity: 1,
          sum: parseFloat(outSum),
          payment_method: "full_payment", // Полная оплата
          payment_object: "service", // Услуга (пополнение баланса)
          tax: "none" // Без НДС
        }
      ]
    };

    // Преобразуем Receipt в JSON строку
    const receiptJson = JSON.stringify(receipt);
    console.log('Receipt JSON:', receiptJson);

    // Генерируем подпись с Password1 и Receipt
    const signature = generateSignature(
      ROBOKASSA_MERCHANT_LOGIN,
      outSum,
      invId,
      ROBOKASSA_PASSWORD1,
      receiptJson,
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
      Encoding: 'utf-8',
      Receipt: receiptJson // Добавляем Receipt
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
      isTest: ROBOKASSA_TEST_MODE,
      receipt: receipt // Сохраняем информацию о чеке
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
