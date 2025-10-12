const express = require('express');
const router = express.Router();
const {
  yoomoneyWebhook,
  robokassaResultURL,
  robokassaSuccessURL,
  robokassaFailURL
} = require('../controllers/paymentWebhook');

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

// Роуты для Robokassa
// ResultURL - для серверного уведомления о платеже (обязательный)
router.post('/robokassa/result', robokassaResultURL);
router.get('/robokassa/result', robokassaResultURL);

// SuccessURL - для редиректа пользователя после успешной оплаты
router.get('/robokassa/success', robokassaSuccessURL);

// FailURL - для редиректа пользователя после неудачной оплаты
router.get('/robokassa/fail', robokassaFailURL);

module.exports = router;
