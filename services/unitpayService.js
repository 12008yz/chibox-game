const crypto = require('crypto');
const { Payment, User } = require('../models');

const UNITPAY_PUBLIC_KEY = process.env.UNITPAY_PUBLIC_KEY || '';
const UNITPAY_SECRET_KEY = process.env.UNITPAY_SECRET_KEY || '';
const UNITPAY_PAY_URL = 'https://unitpay.ru/pay/';

/**
 * Подпись для создания платежа (редирект на форму Unitpay).
 * Документация: https://help.unitpay.ru/en/payments/create-payment-easy
 * signature = sha256(account + "{up}" + currency + "{up}" + desc + "{up}" + sum + "{up}" + secretKey)
 * Если currency не передаётся — не включать в подпись.
 */
function getPaymentSignature(account, currency, desc, sum, secretKey) {
  const parts = currency
    ? [account, currency, desc, String(sum), secretKey]
    : [account, desc, String(sum), secretKey];
  const str = parts.join('{up}');
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Проверка подписи callback от Unitpay (CHECK, PAY, ERROR).
 * Документация: https://help.unitpay.ru/en/payments/payment-handler
 * signature = sha256(method + "{up}" + params + "{up}" + secretKey)
 * params = все значения из params, отсортированные по ключу, объединённые "{up}", без параметра signature.
 */
function verifyHandlerSignature(method, paramsObject, receivedSignature, secretKey) {
  const keys = Object.keys(paramsObject)
    .filter(k => k !== 'signature')
    .sort();
  const values = keys.map(k => String(paramsObject[k] ?? ''));
  const paramsStr = values.join('{up}');
  const str = method + '{up}' + paramsStr + '{up}' + secretKey;
  const calculated = crypto.createHash('sha256').update(str).digest('hex');
  return calculated === receivedSignature;
}

/**
 * Парсинг query/body в объект params (params[account]=x -> { account: 'x' }).
 * Поддержка форматов: req.query['params[account]'] и req.query.params = { account: '...' } (express extended).
 */
function parseParamsFromRequest(req) {
  const raw = { ...req.query, ...req.body };
  const params = {};

  if (raw.params && typeof raw.params === 'object' && !Array.isArray(raw.params)) {
    Object.assign(params, raw.params);
  }
  for (const [key, value] of Object.entries(raw)) {
    const match = key.match(/^params\[(.+)\]$/);
    if (match) {
      params[match[1]] = value;
    }
  }
  return params;
}

/**
 * Создание платежа Unitpay: запись в БД + URL для редиректа.
 * account в Unitpay = идентификатор в нашей системе (используем invoice_number).
 * systemCode — код способа оплаты (card, sbp и т.д.): подставляется в путь, форма сразу открывается с этим методом.
 * См. https://help.unitpay.ru/book-of-reference/payment-system-codes
 */
async function createPayment({ amount, description, userId, purpose = 'deposit', metadata = {}, systemCode = null, promoCodeId = null }) {
  if (!UNITPAY_PUBLIC_KEY || !UNITPAY_SECRET_KEY) {
    throw new Error('Unitpay credentials not configured (UNITPAY_PUBLIC_KEY, UNITPAY_SECRET_KEY)');
  }

  const unitpaySystem = systemCode || (metadata && metadata.unitpay_system) || null;

  const user = await User.findByPk(userId, { attributes: ['email'] });
  const customerEmail = (user && user.email) ? String(user.email).trim() : null;
  const customerPhone = (user && user.phone) ? String(user.phone).trim() : null;

  const paymentRecord = await Payment.create({
    user_id: userId,
    amount: amount,
    payment_system: 'unitpay',
    status: 'pending',
    payment_id: null,
    payment_url: null,
    description: description,
    purpose: purpose,
    webhook_received: false,
    is_test: false,
    currency: 'RUB',
    payment_method: 'unitpay',
    payment_details: {},
    metadata: metadata,
    ...(promoCodeId ? { promo_code_id: promoCodeId } : {})
  });

  await paymentRecord.reload();
  if (!paymentRecord.invoice_number) {
    throw new Error('Failed to generate invoice_number');
  }

  const account = String(paymentRecord.invoice_number);
  const sum = parseFloat(amount).toFixed(2);
  const desc = description || `Оплата #${account}`;
  const currency = 'RUB';

  const signature = getPaymentSignature(account, currency, desc, sum, UNITPAY_SECRET_KEY);

  // cashItems — обязателен для онлайн-кассы: base64(JSON массив позиций чека).
  // Каждая позиция: name (до 128 символов), count, price, type (commodity/service).
  const itemName = (desc && desc.length <= 128) ? desc : `Оплата #${account}`;
  const priceNum = parseFloat(sum);
  const cashItemsArray = [
    { name: itemName.substring(0, 128), count: 1, price: priceNum, type: 'commodity' }
  ];
  const cashItems = Buffer.from(JSON.stringify(cashItemsArray), 'utf8').toString('base64');

  const payParams = new URLSearchParams({
    sum,
    account,
    desc,
    signature,
    currency,
    locale: 'ru',
    cashItems
  });
  // Для СБП и части методов Unitpay обязателен customerEmail или customerPhone
  if (customerEmail) {
    payParams.set('customerEmail', customerEmail);
  } else if (customerPhone) {
    payParams.set('customerPhone', customerPhone);
  } else {
    payParams.set('customerEmail', `user-${account}@chibox-game.ru`);
  }

  // URL: https://unitpay.ru/pay/PUBLICKEY или .../pay/PUBLICKEY/card (сразу форма карты/СБП)
  const pathPart = unitpaySystem ? `${UNITPAY_PUBLIC_KEY}/${unitpaySystem}` : UNITPAY_PUBLIC_KEY;
  const paymentUrl = `${UNITPAY_PAY_URL}${pathPart}?${payParams.toString()}`;

  paymentRecord.payment_url = paymentUrl;
  paymentRecord.payment_details = { account, sum, desc, currency, signature, systemCode: unitpaySystem };
  await paymentRecord.save();

  return {
    success: true,
    paymentUrl,
    paymentId: paymentRecord.invoice_number
  };
}

module.exports = {
  createPayment,
  getPaymentSignature,
  verifyHandlerSignature,
  parseParamsFromRequest,
  UNITPAY_PUBLIC_KEY,
  UNITPAY_SECRET_KEY
};
