const db = require('../../models');
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

async function topUpBalance(req, res) {
  logger.info('topUpBalance start');
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    logger.info(`topUpBalance called with userId=${userId}, amount=${amount}`);

    // Валидация суммы
    if (!amount || amount < 100) {
      logger.warn('Invalid amount: minimum 100 rubles');
      return res.status(400).json({
        success: false,
        message: 'Минимальная сумма пополнения 100 рублей'
      });
    }

    if (amount > 100000) {
      logger.warn('Invalid amount: maximum 100000 rubles');
      return res.status(400).json({
        success: false,
        message: 'Максимальная сумма пополнения 100,000 рублей'
      });
    }

    const user = await db.User.findByPk(userId);
    if (!user) {
      logger.warn('User not found');
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    logger.info(`User loaded: ${user.username}`);

    // Создаем платеж через ЮКассу
    const paymentResult = await createPayment({
      amount: amount,
      description: `Пополнение баланса на ${amount} руб.`,
      userId: userId,
      purpose: 'balance_topup',
      metadata: {
        type: 'balance_topup',
        user_id: userId,
        amount: amount
      }
    });

    if (paymentResult.success) {
      logger.info(`Payment created successfully: ${paymentResult.paymentId}`);
      return res.json({
        success: true,
        data: {
          paymentUrl: paymentResult.paymentUrl,
          paymentId: paymentResult.paymentId
        }
      });
    } else {
      logger.error(`Payment creation failed: ${paymentResult.error}`);
      return res.status(500).json({
        success: false,
        message: 'Ошибка при создании платежа'
      });
    }
  } catch (error) {
    logger.error('topUpBalance error:', error);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера'
    });
  }
}

module.exports = { topUpBalance };
