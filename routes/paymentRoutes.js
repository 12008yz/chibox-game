const express = require('express');
const router = express.Router();
const { yoomoneyWebhook } = require('../controllers/paymentWebhook');

// Middleware для захвата raw body (нужно для проверки подписи ЮKassa)
const captureRawBody = (req, res, next) => {
  let data = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    data += chunk;
  });
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
};

// Роут для обработки webhook от YooMoney
// Важно: используем captureRawBody ДО express.json()
router.post('/webhook', captureRawBody, express.json(), yoomoneyWebhook);

module.exports = router;
