const axios = require('axios');
const winston = require('winston');

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

// Базовая валюта - рубль (1₽ = 1 ChiCoin)
const BASE_CURRENCY = 'RUB';
const CHICOINS_SYMBOL = 'ChiCoins';

// Кэш курсов валют (обновляется каждый час)
let exchangeRatesCache = {
  rates: {
    RUB: 1,
    USD: 0.0105,  // примерно 95₽ за $1
    EUR: 0.0095,  // примерно 105₽ за €1
    GBP: 0.0082,  // примерно 122₽ за £1
    CNY: 0.0750,  // примерно 13.3₽ за ¥1
  },
  lastUpdated: null
};

/**
 * Получить актуальные курсы валют
 * API: exchangerate-api.com (бесплатный план - 1500 запросов/месяц)
 */
async function updateExchangeRates() {
  try {
    logger.info('Updating exchange rates...');

    // Используем бесплатный API для курсов валют
    const apiUrl = `https://api.exchangerate-api.com/v4/latest/${BASE_CURRENCY}`;

    const response = await axios.get(apiUrl, {
      timeout: 10000
    });

    if (response.data && response.data.rates) {
      exchangeRatesCache.rates = {
        RUB: 1,
        USD: response.data.rates.USD || 0.0105,
        EUR: response.data.rates.EUR || 0.0095,
        GBP: response.data.rates.GBP || 0.0082,
        CNY: response.data.rates.CNY || 0.0750,
      };
      exchangeRatesCache.lastUpdated = new Date();

      logger.info('Exchange rates updated successfully', exchangeRatesCache.rates);
      return true;
    }
  } catch (error) {
    logger.error('Failed to update exchange rates:', error.message);
    // Используем кэшированные значения
    return false;
  }
}

/**
 * Конвертировать сумму из любой валюты в ChiCoins
 * @param {number} amount - Сумма в исходной валюте
 * @param {string} fromCurrency - Валюта (RUB, USD, EUR, GBP, CNY)
 * @returns {number} - Сумма в ChiCoins (целое число)
 */
function convertToChiCoins(amount, fromCurrency = 'RUB') {
  if (!exchangeRatesCache.rates[fromCurrency]) {
    logger.warn(`Unsupported currency: ${fromCurrency}, using RUB`);
    fromCurrency = 'RUB';
  }

  // Конвертируем в рубли, затем в ChiCoins (1₽ = 1 ChiCoin)
  const amountInRubles = amount / exchangeRatesCache.rates[fromCurrency];

  // Округляем до целого числа ChiCoins
  return Math.round(amountInRubles);
}

/**
 * Конвертировать ChiCoins в любую валюту
 * @param {number} chicoins - Количество ChiCoins
 * @param {string} toCurrency - Целевая валюта
 * @returns {number} - Сумма в целевой валюте
 */
function convertFromChiCoins(chicoins, toCurrency = 'RUB') {
  if (!exchangeRatesCache.rates[toCurrency]) {
    logger.warn(`Unsupported currency: ${toCurrency}, using RUB`);
    toCurrency = 'RUB';
  }

  // ChiCoins -> Рубли -> Целевая валюта
  const amountInCurrency = chicoins * exchangeRatesCache.rates[toCurrency];

  return amountInCurrency;
}

/**
 * Получить пакеты пополнения для конкретной валюты
 * @param {string} currency - Валюта пользователя
 * @returns {Array} - Массив пакетов пополнения
 */
function getTopUpPackages(currency = 'RUB') {
  const packages = [
    {
      id: 'small',
      chicoins: 500,
      bonus: 0,
      popular: false
    },
    {
      id: 'medium',
      chicoins: 1000,
      bonus: 50, // +5%
      popular: false
    },
    {
      id: 'large',
      chicoins: 2500,
      bonus: 250, // +10%
      popular: true
    },
    {
      id: 'huge',
      chicoins: 5000,
      bonus: 1000, // +20%
      popular: false
    },
    {
      id: 'mega',
      chicoins: 10000,
      bonus: 3000, // +30%
      popular: false
    }
  ];

  // Добавляем цены в выбранной валюте
  return packages.map(pkg => {
    const totalChicoins = pkg.chicoins + pkg.bonus;
    const priceInCurrency = convertFromChiCoins(pkg.chicoins, currency);

    return {
      ...pkg,
      totalChicoins,
      price: priceInCurrency,
      currency,
      currencySymbol: getCurrencySymbol(currency)
    };
  });
}

/**
 * Получить символ валюты
 */
function getCurrencySymbol(currency) {
  const symbols = {
    RUB: '₽',
    USD: '$',
    EUR: '€',
    GBP: '£',
    CNY: '¥'
  };
  return symbols[currency] || currency;
}

/**
 * Получить текущие курсы валют
 */
function getExchangeRates() {
  return {
    ...exchangeRatesCache,
    supportedCurrencies: Object.keys(exchangeRatesCache.rates)
  };
}

/**
 * Определить валюту пользователя по IP (заглушка)
 * В реальности можно использовать GeoIP сервис
 */
function detectUserCurrency(ipAddress) {
  // TODO: Интегрировать GeoIP сервис
  // Пока возвращаем RUB по умолчанию
  return 'RUB';
}

/**
 * Форматировать сумму в ChiCoins
 */
function formatChiCoins(amount) {
  return `${Math.round(amount).toLocaleString()} ${CHICOINS_SYMBOL}`;
}

/**
 * Получить минимальную сумму пополнения в конкретной валюте
 */
function getMinimumTopUp(currency = 'RUB') {
  const minChiCoins = 100;
  return convertFromChiCoins(minChiCoins, currency);
}

// Обновляем курсы при запуске
updateExchangeRates();

// Обновляем курсы каждый час
setInterval(() => {
  updateExchangeRates();
}, 60 * 60 * 1000); // 1 час

module.exports = {
  updateExchangeRates,
  convertToChiCoins,
  convertFromChiCoins,
  getTopUpPackages,
  getCurrencySymbol,
  getExchangeRates,
  detectUserCurrency,
  formatChiCoins,
  getMinimumTopUp,
  CHICOINS_SYMBOL,
  BASE_CURRENCY
};
