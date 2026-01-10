const axios = require('axios');
const crypto = require('crypto');
const { Payment } = require('../models');

const ALFABANK_API_LOGIN = process.env.ALFABANK_API_LOGIN || '';
const ALFABANK_API_PASSWORD = process.env.ALFABANK_API_PASSWORD || '';
const ALFABANK_CALLBACK_TOKEN = process.env.ALFABANK_CALLBACK_TOKEN || '';
const ALFABANK_PAYMENT_GATEWAY_URL = process.env.ALFABANK_PAYMENT_GATEWAY_URL || 'https://pay.alfabank.ru/payment/rest';
const ALFABANK_PAYMENT_URL = process.env.ALFABANK_PAYMENT_URL || 'https://payment.alfabank.ru/sc/elXPIILQUzyrbACo';
const ALFABANK_QR_URL = process.env.ALFABANK_QR_URL || 'https://qr.nspk.ru/AS1A002KJ7AK2VO08LLQM41F8RMBN8GO?type=01&bank=100000000008&crc=5CBB';

// QR-ссылки для подписок (статусов)
const ALFABANK_QR_SUBSCRIPTION_TIER_1 = process.env.ALFABANK_QR_SUBSCRIPTION_TIER_1 || 'https://qr.nspk.ru/AS100057H2F36NIN98OADPLLAVG6KA49?type=01&bank=100000000008&sum=181100&cur=RUB&crc=76E3';
const ALFABANK_QR_SUBSCRIPTION_TIER_2 = process.env.ALFABANK_QR_SUBSCRIPTION_TIER_2 || 'https://qr.nspk.ru/AS10000I0JU5AK9P9PV8JJ2J90RKS826?type=01&bank=100000000008&sum=366600&cur=RUB&crc=882A';
const ALFABANK_QR_SUBSCRIPTION_TIER_3 = process.env.ALFABANK_QR_SUBSCRIPTION_TIER_3 || 'https://qr.nspk.ru/BS10005L54OUO3E78589IIN3SK1N5OPG?type=01&bank=100000000008&sum=758000&cur=RUB&crc=F049';

/**
 * Генерация подписи для проверки callback от Альфа-Банка
 * Формула: MD5(orderNumber + status + callbackToken)
 * @param {string} orderNumber - номер заказа
 * @param {string} status - статус заказа
 * @param {string} callbackToken - токен для callback
 * @returns {string}
 */
function generateCallbackChecksum(orderNumber, status, callbackToken) {
  const signatureString = `${orderNumber}${status}${callbackToken}`;
  return crypto.createHash('md5').update(signatureString).digest('hex').toUpperCase();
}

/**
 * Проверка подписи callback от Альфа-Банка
 * @param {object} params - параметры callback
 * @param {string} params.orderNumber - номер заказа
 * @param {string} params.status - статус заказа
 * @param {string} params.checksum - полученная подпись
 * @returns {boolean}
 */
function verifyCallbackChecksum({ orderNumber, status, checksum }) {
  if (!orderNumber || !status || !checksum) {
    console.log('Missing required parameters for checksum verification');
    return false;
  }

  const calculatedChecksum = generateCallbackChecksum(orderNumber, status, ALFABANK_CALLBACK_TOKEN);
  const isValid = calculatedChecksum === checksum.toUpperCase();

  console.log('Alfabank checksum verification:', {
    orderNumber,
    status,
    received: checksum,
    calculated: calculatedChecksum,
    isValid
  });

  return isValid;
}

/**
 * Регистрация заказа в Альфа-Банке (register.do)
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
    console.log('Alfabank createPayment called with:', { amount, description, userId, purpose, metadata });

    // Проверяем наличие API credentials для динамических платежей
    const useApi = ALFABANK_API_LOGIN && ALFABANK_API_PASSWORD;
    
    if (!useApi && !ALFABANK_PAYMENT_URL && !ALFABANK_QR_URL) {
      throw new Error('Alfabank payment URL or API credentials not configured');
    }

    // Создаем запись в БД для получения ID
    const paymentRecord = await Payment.create({
      user_id: userId,
      amount: amount,
      payment_system: 'alfabank',
      status: 'pending',
      payment_id: null,
      payment_url: null,
      description: description,
      purpose: purpose,
      webhook_received: false,
      is_test: false,
      currency: 'RUB',
      payment_method: 'alfabank',
      payment_details: {},
      metadata: metadata
    });

    // Перезагружаем запись для получения автоинкрементного invoice_number
    await paymentRecord.reload();

    if (!paymentRecord.invoice_number) {
      throw new Error('Failed to generate invoice_number');
    }

    const orderNumber = paymentRecord.invoice_number.toString();
    const amountInKopecks = Math.round(amount * 100); // Альфа-Банк принимает сумму в копейках

    // URL для возврата пользователя после оплаты
    // Используем обработчик на бэкенде, который проверит статус и перенаправит на фронтенд
    const returnUrl = `${process.env.BACKEND_URL || process.env.FRONTEND_URL || 'https://chibox-game.ru'}/api/payments/alfabank/success?orderNumber=${orderNumber}`;
    const failUrl = `${process.env.BACKEND_URL || process.env.FRONTEND_URL || 'https://chibox-game.ru'}/api/payments/alfabank/fail?orderNumber=${orderNumber}`;
    
    // Callback URL для динамических уведомлений
    const callbackUrl = `${process.env.BACKEND_URL || process.env.FRONTEND_URL || 'https://chibox-game.ru'}/api/payments/alfabank/callback`;

    let paymentUrl = null;
    let qrUrl = null;
    let alfabankOrderId = null;

    // Если есть API credentials, используем динамические платежи через API
    if (useApi) {
      console.log('Using Alfabank API for dynamic payment creation...');
      
      try {
        // Для Альфа-Банка API данные отправляются в body как form-urlencoded
        const formData = new URLSearchParams();
        formData.append('userName', ALFABANK_API_LOGIN);
        formData.append('password', ALFABANK_API_PASSWORD);
        formData.append('orderNumber', orderNumber);
        formData.append('amount', amountInKopecks.toString());
        formData.append('returnUrl', returnUrl);
        formData.append('failUrl', failUrl);
        formData.append('description', description || `Payment for ${purpose} by user ${userId}`);
        
        // Для динамических callback указываем callback URL через jsonParams
        formData.append('jsonParams', JSON.stringify({
          callbackUrl: callbackUrl
        }));

        const response = await axios.post(`${ALFABANK_PAYMENT_GATEWAY_URL}/register.do`, formData.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        console.log('Alfabank API register.do response:', response.data);

        if (response.data && response.data.errorCode) {
          throw new Error(`Alfabank API error: ${response.data.errorMessage || response.data.errorCode}`);
        }

        if (response.data && response.data.formUrl) {
          paymentUrl = response.data.formUrl;
          alfabankOrderId = response.data.orderId;
          
          console.log('✅ Dynamic payment created via API:', {
            orderNumber,
            alfabankOrderId,
            paymentUrl,
            returnUrl
          });
        } else {
          throw new Error('No formUrl in Alfabank API response');
        }
      } catch (apiError) {
        console.error('Error creating dynamic payment via API:', apiError.message);
        if (apiError.response) {
          console.error('API Response status:', apiError.response.status);
          console.error('API Response data:', apiError.response.data);
          console.error('API Request URL:', apiError.config?.url);
        }
        if (apiError.request) {
          console.error('API Request made but no response received');
        }
        // Если API не работает, продолжаем со статическими ссылками
        console.warn('Falling back to static payment URLs');
      }
    }

    // Если API не использовался или не сработал, используем статические ссылки
    if (!paymentUrl && ALFABANK_PAYMENT_URL) {
      const paymentUrlParams = new URLSearchParams({
        orderNumber: orderNumber,
        amount: amountInKopecks.toString(),
        returnUrl: returnUrl,
        failUrl: failUrl,
        description: description || `Payment for ${purpose} by user ${userId}`
      });
      paymentUrl = `${ALFABANK_PAYMENT_URL}?${paymentUrlParams.toString()}`;
      
      console.log('Using static Alfabank payment URL:', {
        orderNumber,
        amount: amountInKopecks,
        paymentUrl: ALFABANK_PAYMENT_URL,
        returnUrl
      });
    }

    // Формируем QR-ссылку для СБП (если не используется динамический платеж через API)
    
    if (purpose === 'subscription' && metadata.tierId) {
      // Для подписок используем специальные QR-ссылки для каждого статуса
      const tierId = parseInt(metadata.tierId);
      const subscriptionQrUrls = {
        1: ALFABANK_QR_SUBSCRIPTION_TIER_1, // Статус
        2: ALFABANK_QR_SUBSCRIPTION_TIER_2, // Статус+
        3: ALFABANK_QR_SUBSCRIPTION_TIER_3  // Статус++
      };
      
      qrUrl = subscriptionQrUrls[tierId];
      
      if (qrUrl) {
        // Добавляем returnUrl для возврата на сайт после оплаты
        try {
          const qrUrlObj = new URL(qrUrl);
          qrUrlObj.searchParams.set('returnUrl', returnUrl);
          qrUrl = qrUrlObj.toString();
        } catch (error) {
          console.error('Error adding returnUrl to subscription QR:', error);
        }
        
        console.log('Using subscription QR URL for tier:', {
          tierId: tierId,
          qrUrl: qrUrl
        });
      } else {
        console.warn(`No QR URL configured for subscription tier ${tierId}`);
      }
    } else if (ALFABANK_QR_URL) {
      // Для пополнения баланса генерируем QR-ссылку с суммой
      try {
        // Парсим базовую QR-ссылку
        const qrUrlObj = new URL(ALFABANK_QR_URL);
        
        // Добавляем параметры суммы и назначения платежа для СБП
        // В СБП сумма передается в копейках через параметр Sum
        qrUrlObj.searchParams.set('Sum', amountInKopecks.toString());
        
        // Добавляем назначение платежа
        const paymentDescription = description || `Пополнение баланса #${orderNumber}`;
        // Ограничиваем длину описания (обычно до 140 символов для СБП)
        const shortDescription = paymentDescription.substring(0, 140);
        qrUrlObj.searchParams.set('Name', shortDescription);
        
        // Добавляем номер заказа для идентификации платежа
        qrUrlObj.searchParams.set('OrderId', orderNumber);
        
        // Добавляем комментарий с информацией о заказе
        qrUrlObj.searchParams.set('Comment', `Заказ #${orderNumber}`);
        
        // Добавляем returnUrl для возврата на сайт после оплаты
        qrUrlObj.searchParams.set('returnUrl', returnUrl);
        
        qrUrl = qrUrlObj.toString();
        
        console.log('Generated QR URL with amount:', {
          baseUrl: ALFABANK_QR_URL,
          amount: amountInKopecks,
          qrUrl: qrUrl
        });
      } catch (error) {
        console.error('Error generating QR URL:', error);
        // Если не удалось сформировать URL с параметрами, используем базовую ссылку
        qrUrl = ALFABANK_QR_URL;
      }
    }

    // Обновляем запись платежа
    paymentRecord.payment_url = qrUrl || paymentUrl; // Используем QR как основной URL
    paymentRecord.payment_id = alfabankOrderId || orderNumber; // Используем orderId от API если есть
    paymentRecord.payment_details = {
      orderNumber: orderNumber,
      alfabankOrderId: alfabankOrderId,
      amount: amountInKopecks,
      paymentUrl: paymentUrl,
      qrUrl: qrUrl,
      returnUrl: returnUrl,
      failUrl: failUrl,
      callbackUrl: callbackUrl,
      isDynamic: !!useApi && !!alfabankOrderId // Флаг что это динамический платеж
    };
    await paymentRecord.save();

    console.log('Alfabank payment created:', {
      paymentId: orderNumber,
      qrUrl: qrUrl
    });

    return {
      success: true,
      qrUrl: qrUrl,
      paymentId: orderNumber
    };
  } catch (error) {
    console.error('Ошибка создания платежа в Альфа-Банке:', error.message);
    if (error.response) {
      console.error('Alfabank API response:', error.response.data);
    }
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Проверка статуса заказа в Альфа-Банке (getOrderStatusExtended.do)
 * @param {string} orderNumber - номер заказа
 * @returns {Promise<object>}
 */
async function getOrderStatus(orderNumber) {
  try {
    if (!ALFABANK_API_LOGIN || !ALFABANK_API_PASSWORD) {
      throw new Error('Alfabank credentials not configured');
    }

    const response = await axios.post(`${ALFABANK_PAYMENT_GATEWAY_URL}/getOrderStatusExtended.do`, null, {
      params: {
        userName: ALFABANK_API_LOGIN,
        password: ALFABANK_API_PASSWORD,
        orderId: orderNumber
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    console.error('Ошибка проверки статуса заказа в Альфа-Банке:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  createPayment,
  getOrderStatus,
  verifyCallbackChecksum,
  generateCallbackChecksum
};
