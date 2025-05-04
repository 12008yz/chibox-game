const axios = require('axios');

const YOOKASSA_API_URL = 'https://api.yookassa.ru/v3/payments';
const YOOKASSA_CLIENT_SECRET = process.env.YOOKASSA_CLIENT_SECRET;

async function testAuth() {
  try {
    const response = await axios.post(YOOKASSA_API_URL, {
      amount: {
        value: "1.00",
        currency: "RUB"
      },
      confirmation: {
        type: "redirect",
        return_url: "https://chibox.com"
      },
      capture: true,
      description: "Тестовый платеж",
      metadata: {
        test: true
      }
    }, {
      headers: {
        'Authorization': `Bearer ${YOOKASSA_CLIENT_SECRET}`,
        'Idempotence-Key': `test-payment-${Date.now()}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('Успешный ответ от YooKassa:', response.data);
  } catch (error) {
    if (error.response) {
      console.error('Ошибка от YooKassa:', error.response.status, error.response.data);
    } else {
      console.error('Ошибка запроса:', error.message);
    }
  }
}

testAuth();
