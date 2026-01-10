const express = require('express');
const router = express.Router();
const {
  yoomoneyWebhook,
  freekassaResultURL,
  freekassaSuccessURL,
  freekassaFailURL,
  alfabankCallback,
  alfabankSuccessURL,
  alfabankFailURL
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

// Роуты для Freekassa
// ResultURL - для серверного уведомления о платеже (обязательный)
router.post('/freekassa/result', freekassaResultURL);
router.get('/freekassa/result', freekassaResultURL);

// SuccessURL - для редиректа пользователя после успешной оплаты
router.get('/freekassa/success', freekassaSuccessURL);

// FailURL - для редиректа пользователя после неудачной оплаты
router.get('/freekassa/fail', freekassaFailURL);

// Роуты для Альфа-Банка
// Callback URL - для серверного уведомления о платеже (обязательный)
router.post('/alfabank/callback', alfabankCallback);
router.get('/alfabank/callback', alfabankCallback);

// SuccessURL - для редиректа пользователя после успешной оплаты
router.get('/alfabank/success', alfabankSuccessURL);

// FailURL - для редиректа пользователя после неудачной оплаты
router.get('/alfabank/fail', alfabankFailURL);

module.exports = router;
