const db = require('../../models');
const winston = require('winston');
const { createPayment } = require('../../services/paymentService');
const {
  convertToChiCoins,
  convertFromChiCoins,
  getMinimumTopUp,
  getCurrencySymbol,
  CHICOINS_SYMBOL
} = require('../../services/currencyService');

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
    const { amount, currency = 'RUB', payment_method = 'yookassa' } = req.body;

    logger.info(`topUpBalance called with userId=${userId}, amount=${amount}, currency=${currency}, payment_method=${payment_method}`);
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

    // Валидация суммы (amount теперь это количество ChiCoins)
    if (!amount || typeof amount !== 'number') {
      logger.warn('Invalid amount type or missing amount');
      return res.status(400).json({
        success: false,
        message: 'Неверная сумма пополнения'
      });
    }

    // Проверяем минимум и максимум в ChiCoins
    const minChiCoins = 100;
    const maxChiCoins = 100000;

    if (amount < minChiCoins) {
      logger.warn(`Invalid amount: minimum ${minChiCoins} ChiCoins`);
      return res.status(400).json({
        success: false,
        message: `Минимальная сумма пополнения ${minChiCoins} ChiCoins`
      });
    }

    if (amount > maxChiCoins) {
      logger.warn(`Invalid amount: maximum ${maxChiCoins} ChiCoins`);
      return res.status(400).json({
        success: false,
        message: `Максимальная сумма пополнения ${maxChiCoins} ChiCoins`
      });
    }

    // amount - это ChiCoins, конвертируем в рубли для YooKassa
    const chicoins = amount;
    const amountInRubles = chicoins; // 1 ChiCoin = 1 рубль
    const amountInUserCurrency = convertFromChiCoins(chicoins, currency);

    logger.info(`ChiCoins: ${chicoins}, Amount in RUB: ${amountInRubles}, Display in ${currency}: ${amountInUserCurrency}`);

    const user = await db.User.findByPk(userId);
    if (!user) {
      logger.warn('User not found in database');
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    logger.info(`User loaded: ${user.username}`);

    // Проверяем настройки платежной системы
    if (payment_method === 'yookassa') {
      const shopId = process.env.YOOKASSA_SHOP_ID;
      const clientSecret = process.env.YOOKASSA_CLIENT_SECRET;

      if (!shopId || !clientSecret) {
        logger.error('YooKassa credentials not configured');
        return res.status(500).json({
          success: false,
          message: 'ЮКасса временно недоступна'
        });
      }

      logger.info(`YooKassa credentials check: shopId=${shopId ? 'present' : 'missing'}, clientSecret=${clientSecret ? 'present' : 'missing'}`);
    } else if (payment_method === 'robokassa') {
      const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
      const password1 = process.env.ROBOKASSA_PASSWORD1;

      // Для тестового режима используем дефолтные значения
      const isTest = process.env.ROBOKASSA_TEST_MODE === 'true';

      if (!isTest && (!merchantLogin || !password1)) {
        logger.error('Robokassa credentials not configured');
        return res.status(500).json({
          success: false,
          message: 'Robokassa временно недоступна'
        });
      }

      logger.info(`Robokassa credentials check: merchantLogin=${merchantLogin || 'Test1999'}, isTest=${isTest}`);
    }

    // Создаем платеж (всегда в рублях)
    const currencySymbol = getCurrencySymbol(currency);
    const paymentResult = await createPayment({
      amount: amountInRubles, // Платим в рублях
      description: `Пополнение баланса: ${chicoins} ${CHICOINS_SYMBOL}${currency !== 'RUB' ? ` (≈${amountInUserCurrency.toFixed(2)}${currencySymbol})` : ''}`,
      userId: userId,
      purpose: 'deposit',
      paymentMethod: payment_method,
      metadata: {
        chicoins: chicoins,
        // Остальные данные сохраняем в БД, но не передаем в Shp_ параметры
        amount_in_rubles: amountInRubles,
        display_currency: currency,
        display_amount: amountInUserCurrency
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
