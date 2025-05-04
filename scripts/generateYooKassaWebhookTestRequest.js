const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

const secretKey = 'test_yHoOWYHGGixrUM8blQTAp3bTMrYGvGwQFsRo2BdaziI';

function generateSignature(body, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  return hmac.digest('base64');
}

async function sendWebhook() {
  try {
    const bodyString = fs.readFileSync('webhookBody.json', 'utf-8');
    const signature = generateSignature(bodyString, secretKey);

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
