const axios = require('axios');
const logger = require('../utils/logger');

class SteamPriceService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'http://steamcommunity.com/market/priceoverview/';
    this.cache = new Map();
    this.requestQueue = [];
    this.isProcessing = false;
    this.rateLimit = 1000; // 1 запрос в секунду для избежания блокировки
  }

  /**
   * Получить цену предмета с кэшированием и rate limiting
   */
  async getItemPrice(marketHashName) {
    try {
      // Проверяем кэш (кэш на 1 час)
      const cacheKey = marketHashName;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 3600000) {
        return cached.data;
      }

      // Добавляем в очередь запросов
      return new Promise((resolve) => {
        this.requestQueue.push({
          marketHashName,
          resolve
        });
        this.processQueue();
      });
    } catch (error) {
      logger.error('Ошибка получения цены предмета:', error);
      return this.createErrorResponse();
    }
  }

  /**
   * Обработка очереди запросов с rate limiting
   */
  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();

      try {
        const priceData = await this.fetchPriceFromSteam(request.marketHashName);

        // Кэшируем результат
        this.cache.set(request.marketHashName, {
          data: priceData,
          timestamp: Date.now()
        });

        request.resolve(priceData);
      } catch (error) {
        logger.error(`Ошибка получения цены для ${request.marketHashName}:`, error);
        request.resolve(this.createErrorResponse());
      }

      // Ждем перед следующим запросом
      await this.sleep(this.rateLimit);
    }

    this.isProcessing = false;
  }

  /**
   * Запрос к Steam Market API
   */
  async fetchPriceFromSteam(marketHashName) {
    try {
      const params = {
        appid: '730', // CS2
        currency: '5', // RUB - Российские рубли
        market_hash_name: marketHashName
      };

      const response = await axios.get(this.baseUrl, {
        params,
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (response.data && response.data.success) {
        const priceText = response.data.median_price || response.data.lowest_price || '0';
        const volumeText = response.data.volume || '0';

        // Парсим цену (убираем символы валюты и пробелы)
        const priceRub = this.parsePrice(priceText);
        const volume = parseInt(volumeText.replace(/[^\d]/g, '')) || 0;

        // Определяем категорию по цене
        const category = this.determineCategoryByPrice(priceRub);

        return {
          success: true,
          price_rub: priceRub,
          price_usd: Math.round((priceRub / 95) * 100) / 100, // Примерный курс
          volume: volume,
          category: category,
          market_hash_name: marketHashName,
          source: 'steam_market',
          updated_at: new Date().toISOString()
        };
      } else {
        logger.warn(`Steam API не вернул данные для: ${marketHashName}`);
        return this.createErrorResponse(marketHashName);
      }
    } catch (error) {
      if (error.response?.status === 429) {
        logger.warn('Rate limit достигнут, увеличиваем задержку');
        this.rateLimit = Math.min(this.rateLimit * 2, 5000); // Увеличиваем до максимум 5 сек
      }

      logger.error(`Ошибка запроса к Steam API для ${marketHashName}:`, error.message);
      return this.createErrorResponse(marketHashName);
    }
  }

  /**
   * Парсинг цены из текста Steam
   */
  parsePrice(priceText) {
    if (!priceText || priceText === '--') return 0;

    // Убираем все кроме цифр, точек и запятых
    const cleanPrice = priceText.replace(/[^\d.,]/g, '');

    // Заменяем запятую на точку для правильного парсинга
    const normalizedPrice = cleanPrice.replace(',', '.');

    const price = parseFloat(normalizedPrice) || 0;
    return Math.round(price * 100) / 100; // Округляем до копеек
  }

  /**
   * Определение категории предмета по цене (актуальные пороги 2025)
   */
  determineCategoryByPrice(priceRub) {
    if (priceRub >= 80000) return 'exotic';        // ₽80,000+ (дорогие перчатки)
    if (priceRub >= 25000) return 'contraband';    // ₽25,000+ (ножи)
    if (priceRub >= 8000) return 'covert';         // ₽8,000+ (красные скины)
    if (priceRub >= 1200) return 'classified';     // ₽1,200+ (розовые скины)
    if (priceRub >= 400) return 'restricted';      // ₽400+ (фиолетовые скины)
    if (priceRub >= 80) return 'milspec';          // ₽80+ (синие скины)
    if (priceRub >= 15) return 'industrial';       // ₽15+ (светло-синие)
    return 'consumer';                             // < ₽15 (белые)
  }

  /**
   * Создание ответа об ошибке
   */
  createErrorResponse(marketHashName = '') {
    return {
      success: false,
      price_rub: 0,
      price_usd: 0,
      volume: 0,
      category: 'consumer',
      market_hash_name: marketHashName,
      source: 'error',
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Batch обновление цен для массива предметов
   */
  async updatePricesInBatch(marketHashNames, batchSize = 50) {
    const results = [];

    for (let i = 0; i < marketHashNames.length; i += batchSize) {
      const batch = marketHashNames.slice(i, i + batchSize);
      logger.info(`Обрабатываем batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(marketHashNames.length / batchSize)}`);

      const promises = batch.map(name => this.getItemPrice(name));
      const batchResults = await Promise.all(promises);

      results.push(...batchResults);

      // Пауза между батчами
      if (i + batchSize < marketHashNames.length) {
        await this.sleep(2000);
      }
    }

    return results;
  }

  /**
   * Получить статистику кэша
   */
  getCacheStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp < 3600000) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      queueLength: this.requestQueue.length,
      currentRateLimit: this.rateLimit
    };
  }

  /**
   * Очистка устаревшего кэша
   */
  cleanExpiredCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp >= 3600000) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    logger.info(`Очищено ${cleaned} устаревших записей из кэша`);
    return cleaned;
  }

  /**
   * Вспомогательная функция для задержки
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = SteamPriceService;
