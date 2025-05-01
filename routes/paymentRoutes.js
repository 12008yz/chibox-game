const express = require('express');
const router = express.Router();
const { yoomoneyWebhook } = require('../controllers/paymentWebhook');

// Роут для обработки webhook от YooMoney
router.post('/webhook', express.json(), yoomoneyWebhook);

module.exports = router;
