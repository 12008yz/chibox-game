const axios = require('axios');

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3/payments';
const YOOKASSA_CLIENT_SECRET = process.env.YOOKASSA_CLIENT_SECRET;
const YOOKASSA_RETURN_URL = process.env.YOOKASSA_RETURN_URL || 'https://chibox.com';

function truncateDescription(description) {
  if (description.length > 128) {
    return description.substring(0, 125) + '...';
  }
  return description;
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
    console.log('YOOKASSA_CLIENT_SECRET:', YOOKASSA_CLIENT_SECRET ? '***' : null);

    const description = truncateDescription(`Оплата подписки Chibox - tier ${subscriptionTier} пользователем ${userId}`);
    const response = await axios.post(YOOKASSA_API_URL, {
      amount: {
        value: amount.toFixed(2),
        currency: 'RUB'
      },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: YOOKASSA_RETURN_URL
      },
      description,
      metadata: {
        userId,
        subscriptionTier
      }
    }, {
      headers: {
        'Authorization': `Bearer ${YOOKASSA_CLIENT_SECRET}`,
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
