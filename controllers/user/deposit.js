const winston = require('winston');
const { createPayment } = require('../../services/paymentService');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

async function deposit(req, res) {
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Некорректная сумма для пополнения'
      });
    }

    if (amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Минимальная сумма пополнения: 100 рублей'
      });
    }

    const paymentUrl = await createPayment(amount, userId, 'deposit');

    logger.info(`Пользователь ${userId} инициировал пополнение баланса на сумму ${amount}`);

    return res.json({
      success: true,
      data: {
        payment_url: paymentUrl
      },
      message: 'Перенаправьте пользователя для оплаты'
    });
  } catch (error) {
    logger.error('Ошибка пополнения баланса:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

module.exports = {
  deposit
};
