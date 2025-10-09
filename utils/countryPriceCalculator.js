const CurrencyExchangeService = require('../services/currencyExchangeService');

/**
 * Калькулятор цен по странам с учетом актуальных курсов валют
 */
class CountryPriceCalculator {
   constructor() {
     // Инициализируем сервис курсов валют
     this.currencyService = new CurrencyExchangeService();

     // Маппинг стран на валюты
     this.countryToCurrency = {
       ru: 'RUB',      // Россия - базовая валюта
       en: 'USD',      // США/международный
       de: 'EUR',      // Германия
       fr: 'EUR',      // Франция
       es: 'EUR',      // Испания
       ja: 'JPY',      // Япония
       ko: 'KRW',      // Корея
       zh: 'CNY'       // Китай
     };

     // Маппинг стран на поля в базе данных
     this.countryToPriceField = {
       ru: 'price_rub',
       en: 'price_usd',
       de: 'price_eur',
       fr: 'price_eur',
       es: 'price_eur',
       ja: 'price_jpy',
       ko: 'price_krw',
       zh: 'price_cny'
     };
   }

   /**
    * Умное округление до "красивых" чисел для разных валют
    * Примеры: 5.25$ → 4.99$, 1043¥ → 1000¥, 52₽ → 49₽
    * @param {number} value - Исходная цена
    * @param {string} currency - Код валюты (USD, EUR, JPY, etc.)
    * @returns {number} Округлённая "красивая" цена
    */
   smartRound(value, currency) {
     // Для очень маленьких сумм (меньше 0.5) - округляем до центов
     if (value < 0.5) {
       return Math.round(value * 100) / 100;
     }

     // Японские йены и корейские воны (валюты без дробной части)
     if (currency === 'JPY' || currency === 'KRW') {
       if (value < 100) {
         // До 100: округляем до 10, 50, 90 (10, 50, 90)
         if (value < 50) return Math.round(value / 10) * 10;
         return 50;
       }
       if (value < 1000) {
         // 100-1000: округляем до ..90, ..00 (190, 490, 990)
         const base = Math.floor(value / 100) * 100;
         const remainder = value - base;
         if (remainder < 50) return base - 10; // 190, 290, 390
         return base + 90; // 490, 590, 990
       }
       if (value < 10000) {
         // 1000-10000: округляем до 1000, 2000, 5000, 9000
         const thousands = value / 1000;
         if (thousands < 2) return 1000;
         if (thousands < 3) return 2000;
         if (thousands < 6) return 5000;
         return 9000;
       }
       // Больше 10000: округляем до тысяч
       return Math.round(value / 1000) * 1000;
     }

     // Доллары, евро, юани, рубли (валюты с дробной частью)
     if (currency === 'USD' || currency === 'EUR' || currency === 'CNY' || currency === 'RUB') {
       if (value < 1) {
         // Меньше 1: 0.49, 0.99
         if (value < 0.5) return 0.49;
         return 0.99;
       }
       if (value < 3) {
         // 1-3: 1.49, 1.99, 2.49, 2.99
         const base = Math.floor(value);
         return base + 0.49 + (value - base > 0.75 ? 0.5 : 0);
       }
       if (value < 10) {
         // 3-10: 3.99, 4.99, 5.99, ...
         return Math.floor(value) + 0.99;
       }
       if (value < 20) {
         // 10-20: 9.99, 14.99, 19.99
         if (value < 15) return 9.99;
         if (value < 20) return 14.99;
         return 19.99;
       }
       if (value < 50) {
         // 20-50: 24.99, 29.99, 39.99, 49.99
         if (value < 30) return 24.99;
         if (value < 40) return 29.99;
         if (value < 50) return 39.99;
         return 49.99;
       }
       if (value < 100) {
         // 50-100: 49.99, 69.99, 99.99
         if (value < 70) return 49.99;
         if (value < 100) return 69.99;
         return 99.99;
       }
       if (value < 200) {
         // 100-200: 99.99, 149.99, 199.99
         if (value < 150) return 99.99;
         if (value < 200) return 149.99;
         return 199.99;
       }
       // Больше 200: округляем до ..9.99
       const hundreds = Math.floor(value / 100);
       return hundreds * 100 - 0.01;
     }

     // Для остальных валют - стандартное округление до 2 знаков
     return Math.round(value * 100) / 100;
   }

   /**
    * Рассчитать цены для всех стран на основе базовой цены в рублях
    * @param {number} baseRubPrice - Базовая цена в рублях
    * @returns {object} Объект с ценами для всех стран
    */
   async calculateAllPrices(baseRubPrice) {
     try {
       const prices = {};

       // Получаем актуальные курсы валют
       const exchangeRates = await this.currencyService.getExchangeRates();

       Object.keys(this.countryToCurrency).forEach(countryCode => {
         const currency = this.countryToCurrency[countryCode];
         const priceField = this.countryToPriceField[countryCode];

         if (currency === 'RUB') {
           // Для рублей применяем умное округление
           const roundedPrice = this.smartRound(baseRubPrice, currency);
           prices[priceField] = Number(roundedPrice.toFixed(2));
         } else {
           // Конвертируем в другую валюту
           const rate = exchangeRates[currency];
           if (rate) {
             // rate = сколько RUB за 1 единицу валюты
             // Значит baseRubPrice RUB = baseRubPrice / rate единиц валюты
             const convertedPrice = baseRubPrice / rate;
             // Применяем умное округление для красивых цен
             const roundedPrice = this.smartRound(convertedPrice, currency);
             prices[priceField] = Number(roundedPrice.toFixed(2));
           } else {
             console.warn(`⚠️ Курс для ${currency} не найден, используем 0`);
             prices[priceField] = 0;
           }
         }
       });

       return prices;
     } catch (error) {
       console.error('❌ Ошибка расчета цен по странам:', error);
       // В случае ошибки возвращаем fallback цены
       return this.calculateFallbackPrices(baseRubPrice);
     }
   }

   /**
    * Fallback расчет цен при недоступности курсов валют
    * @param {number} baseRubPrice - Базовая цена в рублях
    * @returns {object} Объект с ценами для всех стран
    */
   calculateFallbackPrices(baseRubPrice) {
     const fallbackRates = {
       USD: 95.0,   // 1 USD = 95 RUB
       EUR: 105.0,  // 1 EUR = 105 RUB
       JPY: 0.65,   // 1 JPY = 0.65 RUB
       KRW: 0.072,  // 1 KRW = 0.072 RUB
       CNY: 13.5    // 1 CNY = 13.5 RUB
     };

     const prices = {};

     Object.keys(this.countryToCurrency).forEach(countryCode => {
       const currency = this.countryToCurrency[countryCode];
       const priceField = this.countryToPriceField[countryCode];

       if (currency === 'RUB') {
         const roundedPrice = this.smartRound(baseRubPrice, currency);
         prices[priceField] = Number(roundedPrice.toFixed(2));
       } else {
         const rate = fallbackRates[currency] || 1;
         const convertedPrice = baseRubPrice / rate;
         const roundedPrice = this.smartRound(convertedPrice, currency);
         prices[priceField] = Number(roundedPrice.toFixed(2));
       }
     });

     return prices;
   }

   /**
    * Получить цену для конкретной страны
    * @param {number} baseRubPrice - Базовая цена в рублях
    * @param {string} countryCode - Код страны (ru, en, de, etc.)
    * @returns {number} Цена для указанной страны
    */
   async getPriceForCountry(baseRubPrice, countryCode) {
     try {
       const currency = this.countryToCurrency[countryCode] || 'RUB';

       if (currency === 'RUB') {
         return Number(baseRubPrice.toFixed(2));
       }

       const convertedPrice = await this.currencyService.convertFromRUB(baseRubPrice, currency);
       return convertedPrice;
     } catch (error) {
       console.warn(`⚠️ Ошибка конвертации для ${countryCode}:`, error.message);
       // Fallback к статическому курсу
       const fallbackRates = { USD: 95, EUR: 105, JPY: 0.65, KRW: 0.072, CNY: 13.5 };
       const currency = this.countryToCurrency[countryCode] || 'RUB';
       const rate = fallbackRates[currency] || 1;
       return Number((baseRubPrice / rate).toFixed(2));
     }
   }

   /**
    * Получить информацию о валюте для страны
    * @param {string} countryCode - Код страны
    * @returns {object} Информация о валюте
    */
   async getCurrencyInfo(countryCode) {
     try {
       const currency = this.countryToCurrency[countryCode] || 'RUB';

       if (currency === 'RUB') {
         return { currency: 'RUB', rate: 1.0 };
       }

       const exchangeRates = await this.currencyService.getExchangeRates();
       const rate = exchangeRates[currency] || 1;

       return {
         currency,
         rate,
         rateDescription: `1 ${currency} = ${rate.toFixed(2)} RUB`
       };
     } catch (error) {
       console.warn(`⚠️ Ошибка получения информации о валюте для ${countryCode}:`, error.message);
       const currency = this.countryToCurrency[countryCode] || 'RUB';
       return { currency, rate: 1.0, error: true };
     }
   }

   /**
    * Получить все поддерживаемые страны
    * @returns {array} Массив кодов стран
    */
   getSupportedCountries() {
     return Object.keys(this.countryToCurrency);
   }

   /**
    * Принудительное обновление курсов валют
    * @returns {object} Новые курсы валют
    */
   async forceUpdateExchangeRates() {
     try {
       const rates = await this.currencyService.forceUpdateRates();
       console.log('✅ Курсы валют принудительно обновлены');
       return rates;
     } catch (error) {
       console.error('❌ Ошибка принудительного обновления курсов:', error);
       throw error;
     }
   }

   /**
    * Получить информацию о текущих курсах валют
    * @returns {object} Информация о курсах
    */
   async getExchangeRatesInfo() {
     return await this.currencyService.getRatesInfo();
   }

   /**
    * Получить название поля цены для страны
    * @param {string} countryCode - Код страны
    * @returns {string} Название поля в БД
    */
   getPriceFieldForCountry(countryCode) {
     return this.countryToPriceField[countryCode] || 'price_rub';
   }

   /**
    * Вывести информацию о всех странах и их валютах
    */
   async printCountryInfo() {
     console.log('\n📊 КУРСЫ ВАЛЮТ ПО СТРАНАМ:');
     console.log('=====================================');

     try {
       const exchangeRates = await this.currencyService.getExchangeRates();
       const ratesInfo = await this.currencyService.getRatesInfo();

       console.log(`💱 Базовая валюта: ${ratesInfo.baseCurrency}`);
       console.log(`⏰ Последнее обновление: ${ratesInfo.cache.lastUpdated || 'N/A'}`);
       console.log(`🔄 Статус кэша: ${ratesInfo.cache.isValid ? 'Актуальный' : 'Устаревший'}`);
       console.log('');

       for (const [countryCode, currency] of Object.entries(this.countryToCurrency)) {
         const priceField = this.countryToPriceField[countryCode];

         if (currency === 'RUB') {
           console.log(`${countryCode.toUpperCase()}: ${currency} (базовая) -> ${priceField}`);
         } else {
           const rate = exchangeRates[currency] || 'N/A';
           console.log(`${countryCode.toUpperCase()}: ${currency} (1 ${currency} = ${rate} RUB) -> ${priceField}`);
         }
       }
     } catch (error) {
       console.error('❌ Ошибка получения курсов валют:', error.message);

       // Показываем fallback информацию
       console.log('⚠️ Используем fallback информацию:');
       Object.entries(this.countryToCurrency).forEach(([countryCode, currency]) => {
         const priceField = this.countryToPriceField[countryCode];
         console.log(`${countryCode.toUpperCase()}: ${currency} -> ${priceField}`);
       });
     }

     console.log('=====================================\n');
   }
 }

 module.exports = CountryPriceCalculator;
