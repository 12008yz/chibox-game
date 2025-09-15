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
    const userId = req.user?.id;
    const { amount } = req.body;

    logger.info(`topUpBalance called with userId=${userId}, amount=${amount}`);
    logger.info(`Request body:`, req.body);
    logger.info(`User:`, req.user);

    // Проверяем авторизацию
    if (!userId) {
      logger.warn('User not authenticated');
      return res.status(401).json({
        success: false,
        message: 'Пользователь не авторизован'
      });
    }

    // Валидация суммы
    if (!amount || typeof amount !== 'number') {
      logger.warn('Invalid amount type or missing amount');
      return res.status(400).json({
        success: false,
        message: 'Неверная сумма пополнения'
      });
    }

    if (amount < 100) {
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
      logger.warn('User not found in database');
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    logger.info(`User loaded: ${user.username}`);

    // Проверяем настройки ЮКассы
    const shopId = process.env.YOOKASSA_SHOP_ID;
    const clientSecret = process.env.YOOKASSA_CLIENT_SECRET;

    if (!shopId || !clientSecret) {
      logger.error('YooKassa credentials not configured');
      return res.status(500).json({
        success: false,
        message: 'Платежная система временно недоступна'
      });
    }

    logger.info(`YooKassa credentials check: shopId=${shopId ? 'present' : 'missing'}, clientSecret=${clientSecret ? 'present' : 'missing'}`);

    // Создаем платеж через ЮКассу
    const paymentResult = await createPayment({
      amount: amount,
      description: `Пополнение баланса на ${amount} руб.`,
      userId: userId,
      purpose: 'deposit', // Используем допустимое значение из ENUM
      metadata: {
        type: 'balance_topup',
        user_id: userId,
        amount: amount
      }
    });

    logger.info(`Payment creation result:`, paymentResult);

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
      logger.error(`Payment creation failed:`, paymentResult.error);
      return res.status(500).json({
        success: false,
        message: 'Ошибка при создании платежа',
        error: paymentResult.error
      });
    }
  } catch (error) {
    logger.error('topUpBalance error:', error);
    logger.error('Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Внутренняя ошибка сервера',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = { topUpBalance };
