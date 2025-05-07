require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateSignature(body, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  return hmac.digest('base64');
}

if (require.main === module) {
  const jsonFilePath = path.resolve(__dirname, '../webhookBody.json');
  const secretKey = process.env.YOOKASSA_CLIENT_SECRET;

  if (!secretKey) {
    console.error('Error: YOOKASSA_CLIENT_SECRET is not set in .env');
    process.exit(1);
  }

  try {
    const jsonBody = fs.readFileSync(jsonFilePath, 'utf8');
    // Убираем JSON.parse, чтобы не менять формат тела
    const signature = generateSignature(jsonBody, secretKey);
    console.log(signature);
  } catch (e) {
    console.error('Invalid JSON file or cannot read file:', e.message);
    process.exit(1);
  }
}

module.exports = generateSignature;
