const axios = require('axios');

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3/payments';
const YOOKASSA_OAUTH_URL = 'https://yookassa.ru/oauth/token';
const YOOKASSA_CLIENT_ID = '4614A5E00E4DE49BE44A54360048F79F4EA6CC48A3F7847CF03BFB4215330973';
const YOOKASSA_CLIENT_SECRET = '218D27E3F1F97326E17499E59D4DC65E154A4E8C02E68E457BD5C4CF7B03D0CECAE760979D8E07B95D28EE8F535587EBF7D3D6E99FB00698F874E996A8AC99C6';
const YOOKASSA_RETURN_URL = process.env.YOOKASSA_RETURN_URL || 'https://chibox.com';
const YOOKASSA_CALLBACK_URL = process.env.YOOKASSA_CALLBACK_URL || 'https://chibox.com/api/payment/webhook';

let accessToken = null;
let tokenExpiresAt = null;

/**
 * Получение OAuth2 access token с использованием client_id и client_secret
 */
async function getAccessToken() {
  if (accessToken && tokenExpiresAt && new Date() < tokenExpiresAt) {
    return accessToken;
  }
  try {
    const response = await axios.post(YOOKASSA_OAUTH_URL, null, {
      params: {
        grant_type: 'client_credentials',
        client_id: YOOKASSA_CLIENT_ID,
        client_secret: YOOKASSA_CLIENT_SECRET
      }
    });
    accessToken = response.data.access_token;
    tokenExpiresAt = new Date(Date.now() + response.data.expires_in * 1000);
    return accessToken;
  } catch (error) {
    throw new Error(`Ошибка получения access token: ${error.message}`);
  }
}

/**
 * Создает платеж в YooKassa и возвращает ссылку для оплаты
 * @param {number} amount - сумма платежа в рублях
 * @param {string} userId - ID пользователя
 * @param {string} subscriptionTier - ID тарифа подписки
 * @returns {Promise<string>} - ссылка на оплату
 */
async function createPayment(amount, userId, subscriptionTier) {
  try {
    const token = await getAccessToken();
    const response = await axios.post(YOOKASSA_API_URL, {
      amount: {
        value: amount.toFixed(2),
        currency: 'RUB'
      },
      confirmation: {
        type: 'redirect',
        return_url: YOOKASSA_RETURN_URL
      },
      description: `Оплата подписки Chibox - tier ${subscriptionTier} пользователем ${userId}`,
      metadata: {
        userId,
        subscriptionTier
      }
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Idempotence-Key': `${userId}-${Date.now()}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.confirmation && response.data.confirmation.confirmation_url) {
      return response.data.confirmation.confirmation_url;
    } else {
      throw new Error('Не удалось получить ссылку на оплату от YooKassa');
    }
  } catch (error) {
    throw new Error(`Ошибка создания платежа в YooKassa: ${error.message}`);
  }
}

module.exports = {
  createPayment
};
