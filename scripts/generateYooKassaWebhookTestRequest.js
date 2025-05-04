const crypto = require('crypto');
const axios = require('axios');

const secretKey = 'test_yHoOWYHGGixrUM8blQTAp3bTMrYGvGwQFsRo2BdaziI';

const webhookBody = {
  id: 'test_payment_id',
  status: 'succeeded',
  payment_method: { type: 'bank_card' },
  amount: { value: '100.00', currency: 'RUB' },
  created_at: '2025-05-04T15:40:07.441Z',
  metadata: { userId: 'test_user', subscriptionTier: 1 }
};

function generateSignature(body, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  return hmac.digest('base64');
}

async function sendWebhook() {
  const bodyString = JSON.stringify(webhookBody);
  const signature = generateSignature(bodyString, secretKey);

  try {
    const response = await axios.post('https://localhost:3000/api/payment/webhook', bodyString, {
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Signature-SHA256': signature
      },
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
      })
    });
    console.log('Webhook sent, response status:', response.status);
  } catch (error) {
    console.error('Error sending webhook:', error.response ? error.response.data : error.message);
  }
}

sendWebhook();
