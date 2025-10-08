/**
 * Калькулятор цен по странам с учетом коэффициентов
 */
class CountryPriceCalculator {
   constructor() {
     // Коэффициенты для пересчета цен по странам
     // Базовая цена в рублях, остальные валюты рассчитываются через коэффициенты
     this.countryCoefficients = {
       ru: { currency: 'RUB', coefficient: 1.0 },      // Россия - базовая цена
       en: { currency: 'USD', coefficient: 0.011 },     // США/международный - дороже (~90 руб за доллар)
       de: { currency: 'EUR', coefficient: 0.010 },     // Германия - дороже (~100 руб за евро)
       fr: { currency: 'EUR', coefficient: 0.010 },     // Франция - также евро
       es: { currency: 'EUR', coefficient: 0.009 },     // Испания - немного дешевле в евро
       ja: { currency: 'JPY', coefficient: 1.65 },      // Япония - дешевле (~55 руб за 100 йен)
       ko: { currency: 'KRW', coefficient: 14.8 },      // Корея - дешевле (~6 руб за 1000 вон)
       zh: { currency: 'CNY', coefficient: 0.077 }      // Китай - дешевле (~13 руб за юань)
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
    * Рассчитать цены для всех стран на основе базовой цены в рублях
    * @param {number} baseRubPrice - Базовая цена в рублях
    * @returns {object} Объект с ценами для всех стран
    */
   calculateAllPrices(baseRubPrice) {
     const prices = {};
 
     Object.keys(this.countryCoefficients).forEach(countryCode => {
       const { coefficient } = this.countryCoefficients[countryCode];
       const priceField = this.countryToPriceField[countryCode];
 
       // Рассчитываем цену с учетом коэффициента
       const calculatedPrice = Math.round(baseRubPrice * coefficient * 100) / 100;
       prices[priceField] = calculatedPrice;
     });
 
     return prices;
   }
 
   /**
    * Получить цену для конкретной страны
    * @param {number} baseRubPrice - Базовая цена в рублях
    * @param {string} countryCode - Код страны (ru, en, de, etc.)
    * @returns {number} Цена для указанной страны
    */
   getPriceForCountry(baseRubPrice, countryCode) {
     const { coefficient } = this.countryCoefficients[countryCode] || this.countryCoefficients.ru;
     return Math.round(baseRubPrice * coefficient * 100) / 100;
   }
 
   /**
    * Получить информацию о валюте для страны
    * @param {string} countryCode - Код страны
    * @returns {object} Информация о валюте
    */
   getCurrencyInfo(countryCode) {
     return this.countryCoefficients[countryCode] || this.countryCoefficients.ru;
   }
 
   /**
    * Получить все поддерживаемые страны
    * @returns {array} Массив кодов стран
    */
   getSupportedCountries() {
     return Object.keys(this.countryCoefficients);
   }
 
   /**
    * Обновить коэффициент для страны
    * @param {string} countryCode - Код страны
    * @param {number} newCoefficient - Новый коэффициент
    */
   updateCountryCoefficient(countryCode, newCoefficient) {
     if (this.countryCoefficients[countryCode]) {
       this.countryCoefficients[countryCode].coefficient = newCoefficient;
       console.log(`✅ Коэффициент для ${countryCode} обновлен: ${newCoefficient}`);
     } else {
       console.error(`❌ Страна ${countryCode} не поддерживается`);
     }
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
    * Вывести информацию о всех странах и их коэффициентах
    */
   printCountryInfo() {
     console.log('\n📊 КОЭФФИЦИЕНТЫ ЦЕН ПО СТРАНАМ:');
     console.log('=====================================');
 
     Object.entries(this.countryCoefficients).forEach(([countryCode, info]) => {
       const priceField = this.countryToPriceField[countryCode];
       console.log(`${countryCode.toUpperCase()}: ${info.currency} (коэфф: ${info.coefficient}) -> ${priceField}`);
     });
 
     console.log('=====================================\n');
   }
 }
 
 module.exports = CountryPriceCalculator;
 