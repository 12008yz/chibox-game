const axios = require('axios');
const winston = require('winston');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const { Item } = require('../models'); // Импорт модели Item

// Логгер
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'lis-service.log' })
  ],
});

class LisService {
  constructor(config) {
    this.cookies = config.cookies || '';
    this.csrfToken = config.csrfToken || '';
    this.sessionId = config.sessionId || '';
    this.apiKey = config.apiKey || '';
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.config = config;

    this.axiosInstance = axios.create({
      baseURL: 'https://lis-skins.com/',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://lis-skins.com/market/cs2',
        'Origin': 'https://lis-skins.com/',
        'Cookie': this.cookies,
        'X-CSRF-TOKEN': this.csrfToken
      }
    });
  }

  async initialize() {
    if (this.browser) return;

    logger.info('Инициализация браузера для работы с LIS-Skins...');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

    if (this.cookies) {
      let cookiesArr = [];
      if (typeof this.cookies === 'string') {
        const cookiePairs = this.cookies.split(';');
        for (const cookiePair of cookiePairs) {
          const [name, value] = cookiePair.trim().split('=');
          if (name && value) {
            cookiesArr.push({ name, value, domain: '.lis-skins.com', path: '/' });
          }
        }
      } else if (Array.isArray(this.cookies)) {
        cookiesArr = this.cookies;
      }
      if (cookiesArr.length > 0) {
        await this.page.setCookie(...cookiesArr);
        logger.info(`Установлено ${cookiesArr.length} cookies`);
      }
    }

    await this.checkLogin();
  }

  async checkLogin() {
    if (!this.cookies || this.cookies.trim() === '') {
      logger.error('Отсутствуют cookies для авторизации в LIS-Skins.');
      this.isLoggedIn = false;
      return false;
    }

    logger.info('Переход на страницу LIS-Skins для проверки авторизации...');
    await this.page.goto('https://lis-skins.com/ru/', { waitUntil: 'networkidle2', timeout: 30000 });

    const isLoggedIn = await this.page.evaluate(() => {
      return !!document.querySelector('.user-profile') || !!document.querySelector('.balance') || !!document.querySelector('.dropdown-toggle-user');
    });

    this.isLoggedIn = isLoggedIn;

    if (isLoggedIn) {
      logger.info('Успешно авторизован на LIS-Skins');
      this.csrfToken = await this.page.evaluate(() => document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '');
      if (this.csrfToken) {
        logger.info('CSRF-токен получен');
        this.axiosInstance.defaults.headers.common['X-CSRF-TOKEN'] = this.csrfToken;
      } else {
        logger.warn('CSRF-токен не найден на странице.');
      }
      try {
        const balanceElement = await this.page.$eval('.balance', el => el.textContent.trim());
        logger.info(`Текущий баланс на LIS-Skins: ${balanceElement}`);
      } catch {
        logger.warn('Не удалось получить баланс, но авторизация успешна');
      }
    } else {
      logger.error('Не удалось авторизоваться на LIS-Skins. Проверьте cookies.');
    }
    return isLoggedIn;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      logger.info('Браузер закрыт');
    }
  }

  async searchItemsByNetworkRequests(category, page = 1) {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) throw new Error('Необходимо авторизоваться на LIS-Skins');
    }
    logger.info(`Запрос предметов категории ${category}, страница ${page}...`);
    const url = `/api/market/items?category=${encodeURIComponent(category)}&page=${page}`;
    const response = await this.axiosInstance.get(url);
    if (response.data && response.data.success && response.data.items) {
      logger.info(`Получено ${response.data.items.length} предметов категории ${category} на странице ${page}`);
      return response.data.items;
    } else {
      logger.warn(`Ошибка получения предметов: ${response.data?.message || 'Неизвестная ошибка'}`);
      return [];
    }
  }

  parseItemsFromHtml(html) {
    const $ = cheerio.load(html);
    const items = [];
    $('.market-skin-preview.market_item').each((i, el) => {
      const element = $(el);
      const idMatch = element.attr('class').match(/market_item_(\d+)/);
      const id = idMatch ? idMatch[1] : null;
      const market_hash_name = element.find('.skin-name').text().trim();
      const floatValue = element.find('.spec-item .spec-title:contains("Float")').next('.spec-value').text().trim() || null;
      const type = element.find('.spec-item .spec-title:contains("Тип")').next('.spec-value').text().trim() || null;
      const rarity = element.find('.spec-item .spec-title:contains("Редкость")').next('.spec-value').text().trim() || null;
      const min_price_text = element.find('.min-price-value').text().replace(/\s/g, '').replace(',', '.');
      const min_price = parseFloat(min_price_text) || null;
      const image = element.find('img.image').attr('src') || null;
      items.push({ id, market_hash_name, float: floatValue, type, rarity, min_price, image });
    });
    return items;
  }

  async importItemsToDb(items) {
    for (const itemData of items) {
      try {
        // Поиск существующего предмета по уникальному buff_id или steam_market_hash_name
        const existingItem = await Item.findOne({
          where: {
            [Op.or]: [
              { buff_id: itemData.id },
              { steam_market_hash_name: itemData.market_hash_name }
            ]
          }
        });

        if (existingItem) {
          // Обновление существующего предмета
          await existingItem.update({
            name: itemData.market_hash_name,
            price: itemData.min_price || 0,
            rarity: itemData.rarity || 'consumer',
            float_value: itemData.float ? parseFloat(itemData.float) : null,
            image_url: itemData.image || null,
            // Добавьте другие поля по необходимости
          });
          logger.info(`Обновлен предмет: ${itemData.market_hash_name}`);
        } else {
          // Создание нового предмета
          await Item.create({
            buff_id: itemData.id,
            name: itemData.market_hash_name,
            price: itemData.min_price || 0,
            rarity: itemData.rarity || 'consumer',
            float_value: itemData.float ? parseFloat(itemData.float) : null,
            image_url: itemData.image || null,
            // Добавьте другие поля по необходимости
          });
          logger.info(`Создан новый предмет: ${itemData.market_hash_name}`);
        }
      } catch (error) {
        logger.error(`Ошибка при импорте предмета ${itemData.market_hash_name}:`, error);
      }
    }
  }

  static loadConfig() {
    const configPath = path.join(__dirname, '../config/lis_config.json');
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        logger.info('Конфигурация LIS-Skins загружена');
        return config;
      }
    } catch (error) {
      logger.error('Ошибка при загрузке конфигурации LIS-Skins:', error);
    }
    return { cookies: '', csrfToken: '', sessionId: '', apiKey: '' };
  }
}

module.exports = LisService;
