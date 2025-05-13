const axios = require('axios');
const crypto = require('crypto');

async function sendTestWebhook(paymentId, secret, url) {
  const payload = {
    event: "payment.succeeded",
    object: {
      id: paymentId,
      status: "succeeded"
    }
  };

  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64');

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-YooKassa-Signature': signature
      }
    });
    console.log('Webhook sent successfully:', response.status, response.data);
  } catch (error) {
    console.error('Error sending webhook:', error.response ? error.response.data : error.message);
  }
}

// Usage example:
// node scripts/sendTestWebhook.js <paymentId> <secret> <url>
if (require.main === module) {
  const [,, paymentId, secret, url] = process.argv;
  if (!paymentId || !secret || !url) {
    console.error('Usage: node sendTestWebhook.js <paymentId> <secret> <url>');
    process.exit(1);
  }
  sendTestWebhook(paymentId, secret, url);
}

module.exports = sendTestWebhook;
