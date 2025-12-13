const winston = require('winston');
const {
  getExchangeRates,
  getTopUpPackages,
  detectUserCurrency,
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

/**
 * Получить информацию о валютах и курсах
 */
async function getCurrency(req, res) {
  try {
    const { currency } = req.query;
    const userIp = req.ip || req.connection.remoteAddress;

    // Определяем валюту пользователя
    const userCurrency = currency || detectUserCurrency(userIp);

    // Получаем курсы
    const exchangeRates = getExchangeRates();

    // Получаем пакеты пополнения для валюты пользователя
    const topUpPackages = getTopUpPackages(userCurrency);

    return res.json({
      success: true,
      data: {
        currentCurrency: userCurrency,
        currencySymbol: getCurrencySymbol(userCurrency),
        chicoinsSymbol: CHICOINS_SYMBOL,
        exchangeRates: exchangeRates.rates,
        lastUpdated: exchangeRates.lastUpdated,
        supportedCurrencies: exchangeRates.supportedCurrencies,
        topUpPackages,
        conversionInfo: {
          base: 'ChiCoins базируются на российском рубле',
          formula: '1 ChiCoin = 1 ChiCoin ⚡',
          note: 'Курсы обновляются ежечасно'
        }
      }
    });
  } catch (error) {
    logger.error('Error in getCurrency:', error);
    return res.status(500).json({
      success: false,
      message: 'Ошибка при получении информации о валютах'
    });
  }
}

module.exports = getCurrency;
