const crypto = require('crypto');
const { Payment } = require('../models');

const FREEKASSA_MERCHANT_ID = process.env.FREEKASSA_MERCHANT_ID || '';
const FREEKASSA_SECRET_WORD_1 = process.env.FREEKASSA_SECRET_WORD_1 || '';
const FREEKASSA_SECRET_WORD_2 = process.env.FREEKASSA_SECRET_WORD_2 || '';
const FREEKASSA_PAYMENT_URL = 'https://pay.fk.money/';

/**
 * Генерация MD5 подписи для Freekassa (при создании платежа)
 * ВАЖНО: Для создания платежа используется формула С currency!
 * @param {string} merchantId
 * @param {number} amount
 * @param {string} secretWord
 * @param {string} currency
 * @param {number} orderId
 * @returns {string}
 */
function generateSignature(merchantId, amount, secretWord, currency, orderId) {
  // Формула ДЛЯ СОЗДАНИЯ ПЛАТЕЖА: MD5(shop_id:amount:secret:currency:order_id)
  const formattedAmount = parseFloat(amount).toFixed(2);
  const signatureString = `${merchantId}:${formattedAmount}:${secretWord}:${currency}:${orderId}`;
  console.log('Freekassa signature string:', signatureString);
  return crypto.createHash('md5').update(signatureString).digest('hex');
}

/**
 * Проверка подписи от Freekassa (webhook)
 * ВАЖНО: Для вебхука (Result URL) используется формула БЕЗ currency!
 * @param {string} merchantId
 * @param {number} amount
 * @param {string} secretWord
 * @param {number} orderId
 * @param {string} receivedSignature
 * @returns {boolean}
 */
function verifySignature(merchantId, amount, secretWord, orderId, receivedSignature) {
  // Формула ДЛЯ ВЕБХУКА (Result URL): MD5(shop_id:amount:secret:order_id) БЕЗ CURRENCY!

  // Пробуем оба варианта форматирования суммы
  // Вариант 1: с .00 (например, 10.00)
  const formattedAmount = parseFloat(amount).toFixed(2);
  const signatureString1 = `${merchantId}:${formattedAmount}:${secretWord}:${orderId}`;
  const calculatedSignature1 = crypto.createHash('md5').update(signatureString1).digest('hex');

  // Вариант 2: без .00 (например, 10)
  const amountStr = String(amount);
  const signatureString2 = `${merchantId}:${amountStr}:${secretWord}:${orderId}`;
  const calculatedSignature2 = crypto.createHash('md5').update(signatureString2).digest('hex');

  console.log('Verify Freekassa Signature:', {
    merchantId,
    amount,
    orderId,
    signatureString1,
    calculated1: calculatedSignature1,
    signatureString2,
    calculated2: calculatedSignature2,
    received: receivedSignature
  });

  // Проверяем оба варианта
  if (calculatedSignature1 === receivedSignature) {
    console.log('✅ Signature matched with variant 1 (formatted amount)');
    return true;
  }

  if (calculatedSignature2 === receivedSignature) {
    console.log('✅ Signature matched with variant 2 (raw amount)');
    return true;
  }

  console.log('❌ Signature verification failed with both variants');
  return false;
}

/**
 * Создание платежа в Freekassa
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
    console.log('Freekassa createPayment called with:', { amount, description, userId, purpose, metadata });

    if (!FREEKASSA_MERCHANT_ID || !FREEKASSA_SECRET_WORD_1) {
      throw new Error('Freekassa credentials not configured');
    }

    // Создаем запись в БД для получения ID
    const paymentRecord = await Payment.create({
      user_id: userId,
      amount: amount,
      payment_system: 'freekassa',
      status: 'pending',
      payment_id: null,
      payment_url: null,
      description: description,
      purpose: purpose,
      webhook_received: false,
      is_test: false,
      currency: 'RUB',
      payment_method: 'freekassa',
      payment_details: {},
      metadata: metadata
    });

    // Перезагружаем запись для получения автоинкрементного invoice_number
    await paymentRecord.reload();

    if (!paymentRecord.invoice_number) {
      throw new Error('Failed to generate invoice_number');
    }

    const orderId = paymentRecord.invoice_number;
    const amountFormatted = amount.toFixed(2);

    // Генерируем подпись (ДЛЯ СОЗДАНИЯ ПЛАТЕЖА - с currency!)
    const signature = generateSignature(
      FREEKASSA_MERCHANT_ID,
      amountFormatted,
      FREEKASSA_SECRET_WORD_1,
      'RUB',
      orderId
    );

    console.log('Generated Freekassa signature:', signature);

    // Формируем URL для оплаты
    const params = new URLSearchParams({
      m: FREEKASSA_MERCHANT_ID,
      oa: amountFormatted,
      o: orderId.toString(),
      s: signature,
      currency: 'RUB',
      lang: 'ru',
      us_user_id: userId.toString(),
      us_purpose: purpose,
      us_chicoins: metadata.chicoins ? metadata.chicoins.toString() : amountFormatted
    });

    const paymentUrl = `${FREEKASSA_PAYMENT_URL}?${params.toString()}`;

    // Обновляем запись платежа
    paymentRecord.payment_url = paymentUrl;
    paymentRecord.payment_details = {
      merchantId: FREEKASSA_MERCHANT_ID,
      orderId: orderId,
      amount: amountFormatted,
      signature: signature
    };
    await paymentRecord.save();

    console.log('Freekassa payment created:', {
      paymentId: orderId,
      paymentUrl: paymentUrl
    });

    return {
      success: true,
      paymentUrl: paymentUrl,
      paymentId: orderId
    };
  } catch (error) {
    console.error('Ошибка создания платежа в Freekassa:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  createPayment,
  verifySignature,
  generateSignature
};
