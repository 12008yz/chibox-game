const axios = require('axios');
const db = require('../models');
const logger = require('../utils/logger');

/**
 * Сервис для получения актуальных курсов валют
 */
class CurrencyExchangeService {
  constructor() {
    // Базовая валюта - рубль (RUB), так как Steam возвращает цены в рублях для РФ
    this.baseCurrency = 'RUB';

    // Поддерживаемые валюты
    this.supportedCurrencies = ['USD', 'EUR', 'JPY', 'KRW', 'CNY'];

    // API ключи для различных сервисов курсов валют
    this.exchangeRateAPIs = [
      {
        name: 'exchangerate-api',
        url: 'https://api.exchangerate-api.com/v4/latest',
        apiKey: process.env.EXCHANGE_RATE_API_KEY, // Опционально
        rateLimitMs: 1000,
        free: true
      },
      {
        name: 'fixer.io',
        url: 'http://data.fixer.io/api/latest',
        apiKey: process.env.FIXER_API_KEY,
        rateLimitMs: 1000,
        free: false
      },
      {
        name: 'currencyapi',
        url: 'https://api.currencyapi.com/v3/latest',
        apiKey: process.env.CURRENCY_API_KEY,
        rateLimitMs: 1000,
        free: false
      }
    ];

    // Кэш курсов валют
    this.exchangeRatesCache = {
      rates: {},
      lastUpdated: null,
      ttl: 60 * 60 * 1000 // 1 час
    };
  }

  /**
   * Получить актуальные курсы валют
   * @returns {object} Курсы валют относительно RUB
   */
  async getExchangeRates() {
    try {
      // Проверяем кэш
      if (this.isCacheValid()) {
        console.log('📦 Используем кэшированные курсы валют');
        return this.exchangeRatesCache.rates;
      }

      console.log('🔄 Получаем актуальные курсы валют...');

      // Пробуем каждый API по очереди
      for (const api of this.exchangeRateAPIs) {
        try {
          const rates = await this.fetchRatesFromAPI(api);
          if (rates) {
            // Сохраняем в кэш
            this.exchangeRatesCache = {
              rates,
              lastUpdated: new Date(),
              ttl: this.exchangeRatesCache.ttl
            };

            // Сохраняем в базу данных для истории
            await this.saveRatesToDatabase(rates);

            console.log('✅ Курсы валют успешно обновлены');
            return rates;
          }
        } catch (error) {
          console.warn(`⚠️ Не удалось получить курсы из ${api.name}:`, error.message);
          continue;
        }
      }

      // Если все API недоступны, используем последние сохраненные курсы
      console.warn('⚠️ Все API курсов недоступны, используем последние сохраненные курсы');
      const savedRates = await this.getLastSavedRates();

      if (savedRates) {
        this.exchangeRatesCache.rates = savedRates;
        return savedRates;
      }

      // В крайнем случае используем fallback курсы
      console.warn('⚠️ Используем fallback курсы валют');
      return this.getFallbackRates();

    } catch (error) {
      console.error('❌ Ошибка получения курсов валют:', error);
      return this.getFallbackRates();
    }
  }

  /**
   * Получить курсы из конкретного API
   */
  async fetchRatesFromAPI(api) {
    try {
      let url = `${api.url}/${this.baseCurrency}`;
      const params = {};

      // Настройка параметров для разных API
      if (api.name === 'fixer.io') {
        url = api.url;
        params.access_key = api.apiKey;
        params.base = this.baseCurrency;
        params.symbols = this.supportedCurrencies.join(',');
      } else if (api.name === 'currencyapi') {
        url = api.url;
        params.apikey = api.apiKey;
        params.base_currency = this.baseCurrency;
        params.currencies = this.supportedCurrencies.join(',');
      } else if (api.name === 'exchangerate-api') {
        // Для exchangerate-api не нужны параметры
        if (api.apiKey) {
          url = `https://v6.exchangerate-api.com/v6/${api.apiKey}/latest/${this.baseCurrency}`;
        }
      }

      const response = await axios.get(url, {
        params,
        timeout: 10000,
        headers: {
          'User-Agent': 'ChiBox-Game/1.0'
        }
      });

      if (!response.data) {
        throw new Error('Пустой ответ от API');
      }

      // Обработка ответа в зависимости от API
      let rates = {};

      if (api.name === 'exchangerate-api') {
        if (response.data.result === 'success' || response.data.rates) {
          rates = this.processExchangeRateAPIResponse(response.data);
        }
      } else if (api.name === 'fixer.io') {
        if (response.data.success) {
          rates = this.processFixerResponse(response.data);
        }
      } else if (api.name === 'currencyapi') {
        if (response.data.data) {
          rates = this.processCurrencyAPIResponse(response.data);
        }
      }

      // Проверяем корректность полученных курсов
      if (this.validateRates(rates)) {
        console.log(`✅ Курсы получены из ${api.name}:`, rates);
        return rates;
      } else {
        throw new Error('Некорректные курсы валют');
      }

    } catch (error) {
      throw new Error(`Ошибка API ${api.name}: ${error.message}`);
    }
  }

  /**
   * Обработка ответа от exchangerate-api.com
   */
  processExchangeRateAPIResponse(data) {
    const rates = {};

    // exchangerate-api возвращает курсы FROM базовой валюты TO других валют
    // Но нам нужны курсы TO базовой валюты FROM других валют
    this.supportedCurrencies.forEach(currency => {
      if (data.rates && data.rates[currency]) {
        // Инвертируем курс: если 1 RUB = 0.011 USD, то 1 USD = 90.9 RUB
        rates[currency] = 1 / data.rates[currency];
      }
    });

    return rates;
  }

  /**
   * Обработка ответа от fixer.io
   */
  processFixerResponse(data) {
    const rates = {};

    this.supportedCurrencies.forEach(currency => {
      if (data.rates && data.rates[currency]) {
        rates[currency] = 1 / data.rates[currency];
      }
    });

    return rates;
  }

  /**
   * Обработка ответа от currencyapi.com
   */
  processCurrencyAPIResponse(data) {
    const rates = {};

    this.supportedCurrencies.forEach(currency => {
      if (data.data && data.data[currency] && data.data[currency].value) {
        rates[currency] = 1 / data.data[currency].value;
      }
    });

    return rates;
  }

  /**
   * Валидация полученных курсов
   */
  validateRates(rates) {
    // Проверяем что все валюты присутствуют
    for (const currency of this.supportedCurrencies) {
      if (!rates[currency] || typeof rates[currency] !== 'number' || rates[currency] <= 0) {
        console.warn(`❌ Некорректный курс для ${currency}: ${rates[currency]}`);
        return false;
      }
    }

    // Проверяем разумность курсов (примерные диапазоны)
    const expectedRanges = {
      USD: [80, 120],    // 1 USD = 80-120 RUB
      EUR: [90, 130],    // 1 EUR = 90-130 RUB
      JPY: [0.5, 1.5],   // 1 JPY = 0.5-1.5 RUB
      KRW: [0.06, 0.12], // 1 KRW = 0.06-0.12 RUB
      CNY: [12, 18]      // 1 CNY = 12-18 RUB
    };

    for (const [currency, [min, max]] of Object.entries(expectedRanges)) {
      const rate = rates[currency];
      if (rate < min || rate > max) {
        console.warn(`⚠️ Подозрительный курс для ${currency}: ${rate} (ожидалось ${min}-${max})`);
        // Не отклоняем, только предупреждаем
      }
    }

    return true;
  }

  /**
   * Проверка валидности кэша
   */
  isCacheValid() {
    if (!this.exchangeRatesCache.lastUpdated || !this.exchangeRatesCache.rates) {
      return false;
    }

    const now = Date.now();
    const cacheAge = now - this.exchangeRatesCache.lastUpdated.getTime();

    return cacheAge < this.exchangeRatesCache.ttl;
  }

  /**
   * Сохранение курсов в базу данных
   */
  async saveRatesToDatabase(rates) {
    try {
      const ratesData = {
        base_currency: this.baseCurrency,
        rates: JSON.stringify(rates),
        source: 'api',
        created_at: new Date()
      };

      // Создаем таблицу если её нет
      await this.ensureExchangeRatesTable();

      // Сохраняем новые курсы
      await db.sequelize.query(`
        INSERT INTO exchange_rates (base_currency, rates, source, created_at)
        VALUES (:base_currency, :rates, :source, :created_at)
      `, {
        replacements: ratesData,
        type: db.Sequelize.QueryTypes.INSERT
      });

      // Удаляем старые записи (оставляем только последние 100)
      await db.sequelize.query(`
        DELETE FROM exchange_rates
        WHERE id NOT IN (
          SELECT id FROM (
            SELECT id FROM exchange_rates
            ORDER BY created_at DESC
            LIMIT 100
          ) tmp
        )
      `);

    } catch (error) {
      console.warn('⚠️ Не удалось сохранить курсы в БД:', error.message);
    }
  }

  /**
   * Получение последних сохраненных курсов
   */
  async getLastSavedRates() {
    try {
      const result = await db.sequelize.query(`
        SELECT rates, created_at FROM exchange_rates
        WHERE base_currency = :base_currency
        ORDER BY created_at DESC
        LIMIT 1
      `, {
        replacements: { base_currency: this.baseCurrency },
        type: db.Sequelize.QueryTypes.SELECT
      });

      if (result.length > 0) {
        const rates = JSON.parse(result[0].rates);
        console.log(`📦 Используем сохраненные курсы от ${result[0].created_at}`);
        return rates;
      }

      return null;
    } catch (error) {
      console.warn('⚠️ Не удалось получить сохраненные курсы:', error.message);
      return null;
    }
  }

  /**
   * Fallback курсы на случай недоступности всех API
   */
  getFallbackRates() {
    console.warn('📋 Используем fallback курсы валют');
    return {
      USD: 95.0,   // 1 USD = 95 RUB
      EUR: 105.0,  // 1 EUR = 105 RUB
      JPY: 0.65,   // 1 JPY = 0.65 RUB
      KRW: 0.072,  // 1 KRW = 0.072 RUB
      CNY: 13.5    // 1 CNY = 13.5 RUB
    };
  }

  /**
   * Создание таблицы для курсов валют
   */
  async ensureExchangeRatesTable() {
    try {
      await db.sequelize.query(`
        CREATE TABLE IF NOT EXISTS exchange_rates (
          id SERIAL PRIMARY KEY,
          base_currency VARCHAR(3) NOT NULL,
          rates JSONB NOT NULL,
          source VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await db.sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_exchange_rates_base_currency_created
        ON exchange_rates (base_currency, created_at DESC)
      `);
    } catch (error) {
      console.warn('⚠️ Не удалось создать таблицу курсов валют:', error.message);
    }
  }

  /**
   * Конвертация суммы из RUB в другую валюту
   */
  async convertFromRUB(amount, toCurrency) {
    const rates = await this.getExchangeRates();

    if (!rates[toCurrency]) {
      throw new Error(`Валюта ${toCurrency} не поддерживается`);
    }

    // rates[currency] = сколько RUB за 1 единицу валюты
    // Значит amount RUB = amount / rates[currency] единиц валюты
    return Number((amount / rates[toCurrency]).toFixed(2));
  }

  /**
   * Получить информацию о курсах
   */
  async getRatesInfo() {
    const rates = await this.getExchangeRates();
    const cacheInfo = {
      lastUpdated: this.exchangeRatesCache.lastUpdated,
      isValid: this.isCacheValid(),
      ttlMinutes: this.exchangeRatesCache.ttl / (60 * 1000)
    };

    return {
      baseCurrency: this.baseCurrency,
      rates,
      cache: cacheInfo
    };
  }

  /**
   * Принудительное обновление курсов
   */
  async forceUpdateRates() {
    this.exchangeRatesCache.lastUpdated = null;
    return await this.getExchangeRates();
  }
}

module.exports = CurrencyExchangeService;
