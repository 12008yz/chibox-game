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
    const { amount, currency = 'RUB', packageId } = req.body;

    logger.info(`topUpBalance called with userId=${userId}, amount=${amount}, currency=${currency}, packageId=${packageId}`);
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

    // Минимальные суммы для разных валют
    const MIN_AMOUNTS = {
      RUB: 100,
      USD: 1,
      EUR: 1,
      JPY: 100,
      KRW: 1000,
      CNY: 10
    };

    // Максимальные суммы для разных валют
    const MAX_AMOUNTS = {
      RUB: 100000,
      USD: 1000,
      EUR: 1000,
      JPY: 100000,
      KRW: 1000000,
      CNY: 10000
    };

    const minAmount = MIN_AMOUNTS[currency] || 100;
    const maxAmount = MAX_AMOUNTS[currency] || 100000;

    if (amount < minAmount) {
      logger.warn(`Invalid amount: minimum ${minAmount} ${currency}`);
      return res.status(400).json({
        success: false,
        message: `Минимальная сумма пополнения ${minAmount} ${currency}`
      });
    }

    if (amount > maxAmount) {
      logger.warn(`Invalid amount: maximum ${maxAmount} ${currency}`);
      return res.status(400).json({
        success: false,
        message: `Максимальная сумма пополнения ${maxAmount} ${currency}`
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
      currency: currency,
      description: `Пополнение баланса на ${amount} ${currency}`,
      userId: userId,
      purpose: 'deposit', // Используем допустимое значение из ENUM
      metadata: {
        type: 'balance_topup',
        user_id: userId,
        amount: amount,
        currency: currency,
        packageId: packageId || null
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
