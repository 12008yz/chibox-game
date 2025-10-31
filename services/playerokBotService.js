const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'playerok-bot.log' })
  ],
});

class PlayerOkBot {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.cookiesPath = path.join(__dirname, '../config/playerok-cookies.json');
  }

  /**
   * Инициализация браузера и авторизация
   */
  async init() {
    try {
      logger.info('🚀 Инициализация PlayerOk бота...');

      this.browser = await puppeteer.launch({
        headless: false, // Для отладки, потом можно сделать true
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process'
        ],
      });

      this.page = await this.browser.newPage();

      // Устанавливаем User-Agent
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
      );

      // Загружаем cookies
      if (fs.existsSync(this.cookiesPath)) {
        const cookies = JSON.parse(fs.readFileSync(this.cookiesPath, 'utf8'));
        await this.page.setCookie(...cookies);
        logger.info('✅ Cookies загружены');
      } else {
        logger.warn('⚠️ Файл с cookies не найден');
      }

      // Переходим на главную страницу
      await this.page.goto('https://playerok.com', { waitUntil: 'networkidle2' });

      // Проверяем авторизацию
      this.isLoggedIn = await this.checkAuth();

      if (this.isLoggedIn) {
        logger.info('✅ Авторизация успешна');
      } else {
        logger.warn('⚠️ Не удалось авторизоваться, возможно cookies устарели');
      }

      return this.isLoggedIn;
    } catch (error) {
      logger.error('❌ Ошибка инициализации:', error);
      throw error;
    }
  }

  /**
   * Проверка авторизации
   */
  async checkAuth() {
    try {
      // Проверяем наличие элементов, которые видны только авторизованным пользователям
      const userMenuExists = await this.page.evaluate(() => {
        return document.querySelector('[data-testid="user-menu"]') !== null ||
               document.querySelector('.user-profile') !== null ||
               document.querySelector('[href*="/profile"]') !== null;
      });

      return userMenuExists;
    } catch (error) {
      logger.error('❌ Ошибка проверки авторизации:', error);
      return false;
    }
  }

  /**
   * Поиск предмета на PlayerOk
   * @param {string} itemName - Название предмета (например "AK-47 | Redline (Field-Tested)")
   * @param {number} maxPrice - Максимальная цена для покупки
   * @returns {Array} Массив найденных предложений
   */
  async searchItem(itemName, maxPrice = null) {
    try {
      logger.info(`🔍 Поиск предмета: "${itemName}" (макс. цена: ${maxPrice || 'не ограничена'}₽)`);

      // Переходим на страницу поиска CS2
      await this.page.goto('https://playerok.com/cs2/items', { waitUntil: 'networkidle2' });

      // Вводим название предмета в поиск
      const searchInputSelector = 'input[type="search"], input[placeholder*="Поиск"], input[name="search"]';
      await this.page.waitForSelector(searchInputSelector, { timeout: 10000 });
      await this.page.type(searchInputSelector, itemName, { delay: 100 });

      // Ждём появления результатов
      await this.page.waitForTimeout(2000);

      // Извлекаем данные о предложениях
      const offers = await this.page.evaluate((maxPrice) => {
        const items = [];
        const cards = document.querySelectorAll('[data-testid="item-card"], .item-card, .product-card');

        cards.forEach((card, index) => {
          try {
            // Извлекаем цену
            const priceElement = card.querySelector('[data-testid="price"], .price, .item-price');
            const priceText = priceElement ? priceElement.textContent.trim() : '';
            const price = parseFloat(priceText.replace(/[^\d.,]/g, '').replace(',', '.'));

            // Извлекаем название
            const nameElement = card.querySelector('[data-testid="item-name"], .item-name, .product-name');
            const name = nameElement ? nameElement.textContent.trim() : '';

            // Извлекаем продавца
            const sellerElement = card.querySelector('[data-testid="seller"], .seller, .seller-name');
            const seller = sellerElement ? sellerElement.textContent.trim() : '';

            // Извлекаем ссылку
            const linkElement = card.querySelector('a[href*="/item/"], a[href*="/product/"]');
            const url = linkElement ? linkElement.href : '';

            // Фильтруем по максимальной цене
            if (maxPrice && price > maxPrice) {
              return;
            }

            if (price && url) {
              items.push({
                name,
                price,
                seller,
                url,
                index
              });
            }
          } catch (e) {
            console.error('Ошибка парсинга карточки:', e);
          }
        });

        // Сортируем по цене (от дешевых к дорогим)
        return items.sort((a, b) => a.price - b.price);
      }, maxPrice);

      logger.info(`✅ Найдено ${offers.length} предложений`);

      if (offers.length > 0) {
        logger.info(`💰 Лучшее предложение: ${offers[0].price}₽ от ${offers[0].seller}`);
      }

      return offers;
    } catch (error) {
      logger.error('❌ Ошибка поиска предмета:', error);
      return [];
    }
  }

  /**
   * Сравнение цен с Steam и ChiBox
   * @param {number} playerokPrice - Цена на PlayerOk
   * @param {number} steamPrice - Цена в Steam (актуальная рыночная цена)
   * @param {number} chiboxPrice - Цена в ChiBox (ваша цена для пользователя)
   * @returns {Object} Результат сравнения с решением о покупке
   */
  comparePrices(playerokPrice, steamPrice, chiboxPrice) {
    const playerokFee = playerokPrice * 0.05; // 5% комиссия PlayerOk
    const totalCost = playerokPrice + playerokFee;

    const result = {
      playerok_price: playerokPrice,
      playerok_fee: playerokFee,
      total_cost: totalCost,
      steam_price: steamPrice,
      chibox_price: chiboxPrice,
      is_profitable: false,
      is_cheaper_than_steam: false,
      is_cheaper_than_chibox: false,
      profit_vs_chibox: 0,
      margin_percent: 0,
      decision: 'reject',
      reason: ''
    };

    // Проверяем, дешевле ли Steam
    result.is_cheaper_than_steam = totalCost <= steamPrice;

    // Проверяем, дешевле ли ChiBox
    result.is_cheaper_than_chibox = totalCost <= chiboxPrice;

    // Рассчитываем прибыль относительно ChiBox
    result.profit_vs_chibox = chiboxPrice - totalCost;
    result.margin_percent = ((result.profit_vs_chibox / chiboxPrice) * 100).toFixed(2);

    // Принимаем решение о покупке
    // ПРАВИЛО: Покупаем только если цена НЕ дороже Steam И НЕ дороже ChiBox
    if (result.is_cheaper_than_steam && result.is_cheaper_than_chibox) {
      result.is_profitable = true;
      result.decision = 'buy';
      result.reason = `Выгодно! Прибыль: ${result.profit_vs_chibox.toFixed(2)}₽ (${result.margin_percent}%)`;
    } else if (!result.is_cheaper_than_steam) {
      result.decision = 'reject';
      result.reason = `Дороже Steam на ${(totalCost - steamPrice).toFixed(2)}₽`;
    } else if (!result.is_cheaper_than_chibox) {
      result.decision = 'reject';
      result.reason = `Дороже ChiBox на ${(totalCost - chiboxPrice).toFixed(2)}₽`;
    }

    return result;
  }

  /**
   * Покупка предмета на PlayerOk
   * @param {string} itemUrl - URL страницы предмета
   * @param {string} userTradeUrl - Steam Trade URL пользователя
   * @returns {Object} Информация о покупке
   */
  async purchaseItem(itemUrl, userTradeUrl) {
    try {
      logger.info(`🛒 Покупка предмета: ${itemUrl}`);

      // Переходим на страницу товара
      await this.page.goto(itemUrl, { waitUntil: 'networkidle2' });

      // Нажимаем кнопку "Купить"
      const buyButtonSelector = 'button[data-testid="buy-button"], button:contains("Купить"), .buy-button';
      await this.page.waitForSelector(buyButtonSelector, { timeout: 10000 });
      await this.page.click(buyButtonSelector);

      // Ждём появления формы покупки
      await this.page.waitForTimeout(2000);

      // Ищем поле для Steam Trade URL (если есть)
      const tradeUrlInputExists = await this.page.evaluate(() => {
        return document.querySelector('input[name*="trade"], input[placeholder*="Trade URL"], input[placeholder*="трейд"]') !== null;
      });

      if (tradeUrlInputExists) {
        const tradeUrlInputSelector = 'input[name*="trade"], input[placeholder*="Trade URL"], input[placeholder*="трейд"]';
        await this.page.waitForSelector(tradeUrlInputSelector);

        // Очищаем поле и вводим Trade URL пользователя
        await this.page.evaluate((selector) => {
          const input = document.querySelector(selector);
          if (input) input.value = '';
        }, tradeUrlInputSelector);

        await this.page.type(tradeUrlInputSelector, userTradeUrl, { delay: 50 });
        logger.info('✅ Trade URL введён в форму покупки');
      }

      // Подтверждаем покупку
      const confirmButtonSelector = 'button[data-testid="confirm-purchase"], button:contains("Подтвердить"), .confirm-button';
      await this.page.waitForSelector(confirmButtonSelector, { timeout: 10000 });
      await this.page.click(confirmButtonSelector);

      // Ждём завершения покупки
      await this.page.waitForTimeout(3000);

      // Получаем номер заказа
      const orderNumber = await this.page.evaluate(() => {
        const orderElement = document.querySelector('[data-testid="order-number"], .order-number, .order-id');
        return orderElement ? orderElement.textContent.trim() : null;
      });

      logger.info(`✅ Заказ оформлен: ${orderNumber || 'номер не найден'}`);

      return {
        success: true,
        order_number: orderNumber,
        message: 'Покупка успешно оформлена'
      };
    } catch (error) {
      logger.error('❌ Ошибка покупки предмета:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Отправка Trade URL в чат продавца
   * @param {string} orderNumber - Номер заказа
   * @param {string} userTradeUrl - Steam Trade URL пользователя
   */
  async sendTradeUrlToSeller(orderNumber, userTradeUrl) {
    try {
      logger.info(`💬 Отправка Trade URL продавцу для заказа ${orderNumber}`);

      // Переходим в раздел заказов
      await this.page.goto('https://playerok.com/orders', { waitUntil: 'networkidle2' });

      // Находим заказ по номеру
      const orderSelector = `[data-order-id="${orderNumber}"], .order[data-id="${orderNumber}"]`;
      await this.page.waitForSelector(orderSelector, { timeout: 10000 });

      // Открываем чат с продавцом
      const chatButtonSelector = `${orderSelector} button[data-testid="open-chat"], ${orderSelector} .open-chat`;
      await this.page.click(chatButtonSelector);

      // Ждём загрузки чата
      await this.page.waitForTimeout(2000);

      // Вводим сообщение с Trade URL
      const messageInputSelector = 'textarea[data-testid="chat-input"], textarea[placeholder*="Сообщение"], .chat-input';
      await this.page.waitForSelector(messageInputSelector);

      const message = `Здравствуйте! Вот мой Steam Trade URL для отправки предмета:\n${userTradeUrl}`;
      await this.page.type(messageInputSelector, message, { delay: 50 });

      // Отправляем сообщение
      const sendButtonSelector = 'button[data-testid="send-message"], button[type="submit"], .send-button';
      await this.page.click(sendButtonSelector);

      logger.info('✅ Trade URL отправлен продавцу в чат');

      return { success: true };
    } catch (error) {
      logger.error('❌ Ошибка отправки Trade URL:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Мониторинг чата с продавцом для отслеживания статуса
   * @param {string} orderNumber - Номер заказа
   * @returns {Object} Статус заказа
   */
  async monitorOrder(orderNumber) {
    try {
      logger.info(`👀 Мониторинг заказа ${orderNumber}`);

      await this.page.goto(`https://playerok.com/orders/${orderNumber}`, { waitUntil: 'networkidle2' });

      const status = await this.page.evaluate(() => {
        const statusElement = document.querySelector('[data-testid="order-status"], .order-status');
        return statusElement ? statusElement.textContent.trim() : 'unknown';
      });

      logger.info(`📊 Статус заказа ${orderNumber}: ${status}`);

      return {
        order_number: orderNumber,
        status,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('❌ Ошибка мониторинга заказа:', error);
      return null;
    }
  }

  /**
   * Закрытие браузера
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      logger.info('🔒 Браузер закрыт');
    }
  }
}

module.exports = PlayerOkBot;
