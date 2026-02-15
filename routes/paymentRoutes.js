const express = require('express');
const router = express.Router();
const {
  unitpayHandler,
  unitpaySuccessURL,
  unitpayFailURL
} = require('../controllers/paymentWebhook');

// Unitpay: обработчик уведомлений (CHECK, PAY, ERROR) — GET
router.get('/unitpay/handler', unitpayHandler);
// Редиректы после оплаты (настраиваются в ЛК Unitpay)
router.get('/unitpay/success', unitpaySuccessURL);
router.get('/unitpay/fail', unitpayFailURL);

module.exports = router;
