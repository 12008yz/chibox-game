const axios = require('axios');
const winston = require('winston');
const cheerio = require('cheerio');
const { createProxy } = require('puppeteer-page-proxy');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Логгер
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'buff-service.log' })
  ],
});

class BuffService {
  constructor(config) {
    this.cookies = config.cookies || '';
    this.csrfToken = config.csrfToken || '';
    this.sessionId = config.sessionId || '';
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.config = config;

    this.axiosInstance = axios.create({
      baseURL: 'https://buff.163.com',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://buff.163.com/market/csgo',
      }
    });
  }

  // Инициализация браузера и страницы
  async initialize() {
    try {
      if (this.browser) {
        return;
      }

      logger.info('Инициализация браузера для работы с BUFF...');
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

      // Установка User-Agent
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

      // Применение cookies
      if (this.cookies) {
        try {
          let cookiesArr = [];

          // Если cookies в формате строки, конвертируем в объекты для puppeteer
          if (typeof this.cookies === 'string') {
            const cookiePairs = this.cookies.split(';');
            for (const cookiePair of cookiePairs) {
              const [name, value] = cookiePair.trim().split('=');
              if (name && value) {
                cookiesArr.push({
                  name,
                  value,
                  domain: '.buff.163.com',
                  path: '/',
                });
              }
            }
          } else if (Array.isArray(this.cookies)) {
            cookiesArr = this.cookies;
          }

          if (cookiesArr.length > 0) {
            await this.page.setCookie(...cookiesArr);
            logger.info(`Установлено ${cookiesArr.length} cookies`);
          }
        } catch (error) {
          logger.error('Ошибка при установке cookies:', error);
        }
      }

      // Проверяем авторизацию
      await this.checkLogin();

      return true;
    } catch (error) {
      logger.error('Ошибка инициализации браузера:', error);
      throw error;
    }
  }

  // Проверка статуса авторизации
  async checkLogin() {
    try {
      await this.page.goto('https://buff.163.com/market/csgo', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Пробуем найти элемент, который есть только у авторизованных пользователей
      const isLoggedIn = await this.page.evaluate(() => {
        return !!document.querySelector('.avatar-mini') ||
               !!document.querySelector('.user-info') ||
               document.body.innerHTML.includes('logout');
      });

      this.isLoggedIn = isLoggedIn;

      if (isLoggedIn) {
        logger.info('Успешно авторизован на BUFF');

        // Сохраняем CSRF-токен
        this.csrfToken = await this.page.evaluate(() => {
          return document.querySelector('meta[name="csrf_token"]')?.getAttribute('content') || '';
        });

        if (this.csrfToken) {
          logger.info('CSRF-токен получен');
          this.axiosInstance.defaults.headers.common['X-CSRFToken'] = this.csrfToken;
        }
      } else {
        logger.warn('Не удалось авторизоваться на BUFF. Проверьте cookies.');
      }

      return isLoggedIn;
    } catch (error) {
      logger.error('Ошибка при проверке авторизации:', error);
      this.isLoggedIn = false;
      return false;
    }
  }

  // Закрытие браузера
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      logger.info('Браузер закрыт');
    }
  }

  // Поиск предмета на BUFF по полному названию и степени износа
  async searchItem(marketHashName, exterior) {
    try {
      if (!this.isLoggedIn) {
        await this.initialize();
        if (!this.isLoggedIn) {
          throw new Error('Необходимо авторизоваться на BUFF');
        }
      }

      // Подготавливаем имя для поиска (без указания износа)
      let name = marketHashName;
      if (exterior) {
        // Удаляем информацию о степени износа из имени, если она есть
        name = name.replace(/ \(Factory New\)| \(Minimal Wear\)| \(Field-Tested\)| \(Well-Worn\)| \(Battle-Scarred\)/g, '');
      }

      logger.info(`Поиск предмета на BUFF: ${name} (${exterior || 'любой износ'})`);

      // URL для поиска
      const searchUrl = `https://buff.163.com/api/market/search/suggest?game=csgo&text=${encodeURIComponent(name)}`;

      const response = await this.axiosInstance.get(searchUrl);

      if (response.data && response.data.code === 'OK' && response.data.data && response.data.data.suggestions) {
        const suggestions = response.data.data.suggestions;

        // Ищем точное совпадение по имени
        const exactMatch = suggestions.find(item => {
          // Если указан exterior, проверяем его соответствие
          if (exterior) {
            return item.market_hash_name.includes(name) && item.market_hash_name.includes(exterior);
          }
          // Иначе ищем просто по имени
          return item.market_hash_name === marketHashName;
        });

        if (exactMatch) {
          logger.info(`Найден точное совпадение: ${exactMatch.market_hash_name} (ID: ${exactMatch.id})`);

          // Получаем дополнительную информацию о предмете
          const itemDetails = await this.getItemDetails(exactMatch.id);
          return {
            ...exactMatch,
            ...itemDetails
          };
        } else {
          // Если точного совпадения нет, ищем частичное
          const partialMatch = suggestions.find(item => item.market_hash_name.includes(name));

          if (partialMatch) {
            logger.info(`Найдено частичное совпадение: ${partialMatch.market_hash_name} (ID: ${partialMatch.id})`);

            // Получаем дополнительную информацию о предмете
            const itemDetails = await this.getItemDetails(partialMatch.id);
            return {
              ...partialMatch,
              ...itemDetails
            };
          }
        }
      }

      logger.warn(`Предмет не найден: ${marketHashName}`);
      return null;
    } catch (error) {
      logger.error(`Ошибка поиска предмета ${marketHashName}:`, error);
      throw error;
    }
  }

  // Получение детальной информации о предмете
  async getItemDetails(buffItemId) {
    try {
      const url = `https://buff.163.com/api/market/goods/sell_order?game=csgo&goods_id=${buffItemId}&page_num=1&sort_by=default&mode=&allow_tradable_cooldown=1`;

      const response = await this.axiosInstance.get(url);

      if (response.data && response.data.code === 'OK' && response.data.data) {
        const itemData = response.data.data;

        return {
          goods_id: buffItemId,
          lowest_price: itemData.items && itemData.items.length > 0 ? itemData.items[0].price : null,
          sell_min_price: itemData.goods_infos && itemData.goods_infos[buffItemId] ? itemData.goods_infos[buffItemId].sell_min_price : null,
          sell_num: itemData.goods_infos && itemData.goods_infos[buffItemId] ? itemData.goods_infos[buffItemId].sell_num : 0,
          items: itemData.items || []
        };
      }

      return null;
    } catch (error) {
      logger.error(`Ошибка получения деталей предмета (ID: ${buffItemId}):`, error);
      throw error;
    }
  }

  // Покупка предмета на BUFF
  async buyItem(buffItemId, assetId, price) {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на BUFF');
      }
    }

    logger.info(`Покупка предмета на BUFF: Item ID ${buffItemId}, Asset ID ${assetId}, Цена ${price}`);

    try {
      // URL для покупки предмета
      const buyUrl = 'https://buff.163.com/api/market/goods/buy';

      // Данные для запроса
      const data = {
        game: 'csgo',
        goods_id: buffItemId,
        sell_order_id: assetId,
        price: price,
        allow_tradable_cooldown: 1,
        cdkey_id: '',
        _csrf: this.csrfToken
      };

      // Отправляем запрос на покупку
      const response = await this.axiosInstance.post(buyUrl, data);

      if (response.data && response.data.code === 'OK') {
        logger.info(`Предмет успешно куплен: ${response.data.data.bill_no}`);
        return {
          success: true,
          bill_no: response.data.data.bill_no,
          data: response.data.data
        };
      } else {
        logger.warn(`Ошибка покупки предмета: ${response.data.message || JSON.stringify(response.data)}`);
        return {
          success: false,
          message: response.data.message || 'Неизвестная ошибка',
          data: response.data
        };
      }
    } catch (error) {
      logger.error(`Ошибка при покупке предмета (ID: ${buffItemId}):`, error);
      throw error;
    }
  }

  // Получение инвентаря BUFF
  async getBuffInventory() {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на BUFF');
      }
    }

    logger.info('Получение инвентаря BUFF...');

    try {
      // Добавляем steamid в параметры запроса
      const steamid = this.config.steamid || '';
      const inventoryUrl = `https://buff.163.com/api/market/steam_inventory?game=csgo&page_num=1&page_size=200&state=all&steamid=${steamid}`;

      // Передаем cookies в заголовке
      const headers = {
        Cookie: this.cookies,
        'X-CSRFToken': this.csrfToken,
      };

      const response = await this.axiosInstance.get(inventoryUrl, { headers });

      if (response.data && response.data.code === 'OK' && response.data.data) {
        logger.info(`Получены предметы из инвентаря BUFF: ${response.data.data.items.length}`);
        return {
          success: true,
          items: response.data.data.items || [],
          total: response.data.data.total || 0
        };
      } else {
        logger.warn(`Ошибка получения инвентаря: ${response.data.message || JSON.stringify(response.data)}`);
        return {
          success: false,
          message: response.data.message || 'Неизвестная ошибка',
          items: []
        };
      }
    } catch (error) {
      logger.error('Ошибка при получении инвентаря BUFF:', error);
      throw error;
    }
  }

  // Получение статуса доставки предмета в инвентарь Steam
  async checkItemDeliveryStatus(billNo) {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на BUFF');
      }
    }

    logger.info(`Проверка статуса доставки предмета: Bill No ${billNo}`);

    try {
      const statusUrl = `https://buff.163.com/api/market/bill_order/batch_bill_info?bill_no=${billNo}`;

      const response = await this.axiosInstance.get(statusUrl);

      if (response.data && response.data.code === 'OK' && response.data.data) {
        const status = response.data.data[billNo] ? response.data.data[billNo].state : null;
        logger.info(`Статус доставки предмета (${billNo}): ${status}`);

        return {
          success: true,
          bill_no: billNo,
          status: status,
          data: response.data.data[billNo] || {}
        };
      } else {
        logger.warn(`Ошибка получения статуса доставки: ${response.data.message || JSON.stringify(response.data)}`);
        return {
          success: false,
          message: response.data.message || 'Неизвестная ошибка',
          data: null
        };
      }
    } catch (error) {
      logger.error(`Ошибка при проверке статуса доставки (Bill No: ${billNo}):`, error);
      throw error;
    }
  }

  // Сохранение конфигурации
  saveConfig() {
    const configPath = path.join(__dirname, '../config/buff_config.json');

    const config = {
      cookies: this.cookies,
      csrfToken: this.csrfToken,
      sessionId: this.sessionId,
      lastUpdated: new Date().toISOString()
    };

    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      logger.info('Конфигурация BUFF сохранена');
      return true;
    } catch (error) {
      logger.error('Ошибка при сохранении конфигурации BUFF:', error);
      return false;
    }
  }

  // Загрузка конфигурации
  static loadConfig() {
    const configPath = path.join(__dirname, '../config/buff_config.json');

    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        logger.info('Конфигурация BUFF загружена');
        return config;
      }
    } catch (error) {
      logger.error('Ошибка при загрузке конфигурации BUFF:', error);
    }

    return {
      cookies: '',
      csrfToken: '',
      sessionId: ''
    };
  }
}

module.exports = BuffService;
