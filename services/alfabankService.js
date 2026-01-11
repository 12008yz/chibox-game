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
 * Альфа-Банк может использовать MD5 или SHA256 в зависимости от настроек
 * Формула MD5: MD5(orderNumber + status + callbackToken)
 * Формула SHA256: SHA256(orderNumber + status + callbackToken)
 * @param {string} orderNumber - номер заказа
 * @param {string} status - статус заказа
 * @param {string} callbackToken - токен для callback
 * @param {string} algorithm - алгоритм хеширования ('md5' или 'sha256')
 * @returns {string}
 */
function generateCallbackChecksum(orderNumber, status, callbackToken, algorithm = 'md5') {
  const signatureString = `${orderNumber}${status}${callbackToken}`;
  if (algorithm === 'sha256') {
    return crypto.createHash('sha256').update(signatureString).digest('hex').toUpperCase();
  }
  return crypto.createHash('md5').update(signatureString).digest('hex').toUpperCase();
}

/**
 * Проверка подписи callback от Альфа-Банка
 * Поддерживает как MD5 (32 символа), так и SHA256 (64 символа)
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

  if (!ALFABANK_CALLBACK_TOKEN) {
    console.warn('ALFABANK_CALLBACK_TOKEN not configured, skipping checksum verification');
    return true; // Если токен не настроен, пропускаем проверку
  }

  // Определяем алгоритм по длине checksum
  // MD5 = 32 символа, SHA256 = 64 символа
  const checksumLength = checksum.length;
  let isValid = false;
  let calculatedChecksum = '';

  if (checksumLength === 64) {
    // SHA256 (64 символа)
    calculatedChecksum = generateCallbackChecksum(orderNumber, status, ALFABANK_CALLBACK_TOKEN, 'sha256');
    isValid = calculatedChecksum === checksum.toUpperCase();
  } else if (checksumLength === 32) {
    // MD5 (32 символа)
    calculatedChecksum = generateCallbackChecksum(orderNumber, status, ALFABANK_CALLBACK_TOKEN, 'md5');
    isValid = calculatedChecksum === checksum.toUpperCase();
  } else {
    console.warn(`Unexpected checksum length: ${checksumLength}, expected 32 (MD5) or 64 (SHA256)`);
    // Пробуем оба варианта
    const md5Checksum = generateCallbackChecksum(orderNumber, status, ALFABANK_CALLBACK_TOKEN, 'md5');
    const sha256Checksum = generateCallbackChecksum(orderNumber, status, ALFABANK_CALLBACK_TOKEN, 'sha256');
    isValid = md5Checksum === checksum.toUpperCase() || sha256Checksum === checksum.toUpperCase();
    calculatedChecksum = `${md5Checksum} (MD5) or ${sha256Checksum} (SHA256)`;
  }

  console.log('Alfabank checksum verification:', {
    orderNumber,
    status,
    received: checksum,
    receivedLength: checksumLength,
    calculated: calculatedChecksum,
    algorithm: checksumLength === 64 ? 'SHA256' : checksumLength === 32 ? 'MD5' : 'UNKNOWN',
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
        
        // Для динамических callback указываем callback URL напрямую
        // По документации Альфа-Банка параметр callbackUrl должен быть указан отдельно
        formData.append('callbackUrl', callbackUrl);

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
 * @param {string} orderNumber - номер заказа (может быть orderId, mdOrder или invoice_number)
 * @returns {Promise<object>}
 */
async function getOrderStatus(orderNumber) {
  try {
    if (!ALFABANK_API_LOGIN || !ALFABANK_API_PASSWORD) {
      throw new Error('Alfabank credentials not configured');
    }

    // Для getOrderStatusExtended.do можно использовать как orderId, так и orderNumber
    // Пробуем сначала как orderId (для динамических платежей)
    let response;
    try {
      const formData = new URLSearchParams();
      formData.append('userName', ALFABANK_API_LOGIN);
      formData.append('password', ALFABANK_API_PASSWORD);
      formData.append('orderId', orderNumber);
      
      response = await axios.post(`${ALFABANK_PAYMENT_GATEWAY_URL}/getOrderStatusExtended.do`, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
    } catch (firstError) {
      // Если не сработало с orderId, пробуем с orderNumber
      if (firstError.response && firstError.response.data && firstError.response.data.errorCode) {
        console.log(`Trying with orderNumber instead of orderId for ${orderNumber}`);
        const formData = new URLSearchParams();
        formData.append('userName', ALFABANK_API_LOGIN);
        formData.append('password', ALFABANK_API_PASSWORD);
        formData.append('orderNumber', orderNumber);
        
        response = await axios.post(`${ALFABANK_PAYMENT_GATEWAY_URL}/getOrderStatusExtended.do`, formData.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });
      } else {
        throw firstError;
      }
    }

    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    console.error('Ошибка проверки статуса заказа в Альфа-Банке:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
    return {
      success: false,
      error: error.message,
      errorData: error.response?.data
    };
  }
}

module.exports = {
  createPayment,
  getOrderStatus,
  verifyCallbackChecksum,
  generateCallbackChecksum
};
