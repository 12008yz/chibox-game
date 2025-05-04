const crypto = require('crypto');
const fs = require('fs');

function generateSignature(body, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  return hmac.digest('base64');
}

// Example usage:
// const body = fs.readFileSync('webhookBody.json', 'utf8');
// const secret = 'test_yHoOWYHGGixrUM8blQTAp3bTMrYGvGwQFsRo2BdaziI';
// console.log(generateSignature(body, secret));

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node generateYooKassaSignature.js <jsonFilePath> <secretKey>');
    process.exit(1);
  }
  const jsonFilePath = args[0];
  const secretKey = args[1];
  try {
    const jsonBody = fs.readFileSync(jsonFilePath, 'utf8');
    JSON.parse(jsonBody); // Validate JSON
    const signature = generateSignature(jsonBody, secretKey);
    console.log(signature);
  } catch (e) {
    console.error('Invalid JSON file or cannot read file:', e.message);
    process.exit(1);
  }
}

module.exports = generateSignature;
