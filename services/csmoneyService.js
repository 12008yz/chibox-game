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
    new winston.transports.File({ filename: 'csmoney-service.log' })
  ],
});

class CSMoneyService {
  constructor(config) {
    this.cookies = config.cookies || '';
    this.csrfToken = config.csrfToken || '';
    this.sessionId = config.sessionId || '';
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.config = config;

    this.axiosInstance = axios.create({
      baseURL: 'https://cs.money',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://cs.money/ru/market/buy/',
        'Origin': 'https://cs.money',
        'Cookie': this.cookies
      }
    });
  }

  async initialize() {
    if (this.browser) return;

    logger.info('Инициализация браузера для работы с CS.Money...');

    // Запускаем браузер с headless, как в продакшене мы обычно не хотим видеть браузер
    this.browser = await puppeteer.launch({
      headless: 'new',  // В продакшн-режиме используем headless
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-web-security',  // Отключаем проверку безопасности
        '--disable-features=IsolateOrigins,site-per-process' // Отключаем изоляцию, что может помочь с определёнными куки
      ]
    });

    this.page = await this.browser.newPage();

    // Устанавливаем современный User-Agent
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');

    // Устанавливаем больший viewport
    await this.page.setViewport({ width: 1920, height: 1080 });

    // Добавляем обход для обнаружения автоматизации
    await this.page.evaluateOnNewDocument(() => {
      // Скрываем webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // Добавляем plugins и mimeTypes
      window.navigator.plugins = [1, 2, 3, 4, 5];
      window.navigator.plugins.refresh = () => {};

      window.navigator.mimeTypes = [1, 2, 3, 4, 5];

      // Добавляем языки
      Object.defineProperty(navigator, 'languages', {
        get: () => ['ru-RU', 'ru', 'en-US', 'en'],
      });

      // Исправляем определение автоматизации
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    });

    // Более продвинутый обход обнаружения
    await this.page.evaluateOnNewDocument(() => {
      // Перехватываем проверки Puppeteer
      const newProto = navigator.__proto__;
      delete newProto.webdriver;
      navigator.__proto__ = newProto;
    });

    // Включаем JavaScript
    await this.page.setJavaScriptEnabled(true);

    // Установка cookies
    if (this.cookies) {
      try {
        let cookiesArr = [];

        if (typeof this.cookies === 'string') {
          // Разбиваем строку cookies на части
          const cookiePairs = this.cookies.split(';');

          for (const cookiePair of cookiePairs) {
            if (!cookiePair.trim()) continue;

            // Более безопасный способ парсинга cookies
            const firstEqualIndex = cookiePair.indexOf('=');
            if (firstEqualIndex > 0) {
              const name = cookiePair.substring(0, firstEqualIndex).trim();
              const value = cookiePair.substring(firstEqualIndex + 1).trim();

              if (name && value) {
                // Определяем домен и path в зависимости от типа cookie
                // Для cf_clearance, cookie должна быть точной
                let domain = '.cs.money';
                let path = '/';

                if (name === 'cf_clearance') {
                  domain = '.cs.money';  // Cloudflare должен быть на домене верхнего уровня
                } else if (name === 'csp-nonce' || name === 'seconds_on_page_-1653249155' ||
                           name === 'seconds_on_page_104055' || name === 'settings_visual_card_size' ||
                           name === 'u_dpi' || name === 'u_vp') {
                  domain = 'cs.money';  // Некоторые cookies устанавливаются без поддомена
                }

                cookiesArr.push({
                  name,
                  value,
                  domain,
                  path,
                  httpOnly: name === 'cf_clearance' || name === 'csgo_ses' || name === 'support_token',
                  secure: name === 'cf_clearance'
                });
              }
            }
          }
        } else if (Array.isArray(this.cookies)) {
          cookiesArr = this.cookies;
        }

        if (cookiesArr.length > 0) {
          // Устанавливаем cookies
          await this.page.setCookie(...cookiesArr);
          logger.info(`Установлено ${cookiesArr.length} cookies`);

          // Выводим имена установленных cookies для отладки
          logger.info(`Установленные cookies: ${cookiesArr.map(c => c.name).join(', ')}`);
        }
      } catch (error) {
        logger.error('Ошибка при установке cookies:', error);
      }
    }

    // Проверяем авторизацию
    await this.checkLogin();
  }

  async checkLogin() {
    if (!this.cookies || this.cookies.trim() === '') {
      logger.error('Отсутствуют cookies для авторизации в CS.Money.');
      this.isLoggedIn = false;
      return false;
    }

    logger.info('Переход на страницу CS.Money для проверки авторизации...');

    try {
      // Сначала переходим на главную страницу, чтобы инициализировать cookies правильно
      await this.page.goto('https://cs.money/', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Добавляем задержку для правильной обработки страницы
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Затем переходим на страницу маркета
      await this.page.goto('https://cs.money/ru/market/buy/', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Добавляем ещё одну задержку перед проверкой авторизации
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Делаем скриншот для диагностики
      await this.page.screenshot({ path: 'csmoney-login-check.png' });
      logger.info('Сделан скриншот страницы для проверки (csmoney-login-check.png)');

      // Расширяем варианты проверки авторизации
      const isLoggedIn = await this.page.evaluate(() => {
        // Проверяем различные элементы, которые могут указывать на авторизацию
        return !!document.querySelector('.profile') ||
               !!document.querySelector('.balance') ||
               !!document.querySelector('.user-info') ||
               !!document.querySelector('.user__name') ||
               !!document.querySelector('.side-menu__logo-account') ||
               !!document.querySelector('.user-panel') ||
               !!document.querySelector('.user-balance') ||
               // Альтернативная проверка - если на странице отсутствует кнопка входа
               !document.querySelector('.login-btn');
      });

      this.isLoggedIn = isLoggedIn;

      if (isLoggedIn) {
        logger.info('Успешно авторизован на CS.Money');

        // Получение CSRF-токена из страницы
        this.csrfToken = await this.page.evaluate(() => {
          const csrfMeta = document.querySelector('meta[name="csrf-token"]');
          const csrfInput = document.querySelector('input[name="_csrf"]');
          const reactAppData = window.__NEXT_DATA__;

          // Пытаемся найти токен в React-данных
          if (reactAppData && reactAppData.props && reactAppData.props.pageProps) {
            return reactAppData.props.pageProps.csrfToken || '';
          }

          return (csrfMeta?.getAttribute('content') || csrfInput?.value || '');
        });

        if (this.csrfToken) {
          logger.info('CSRF-токен получен');
          this.axiosInstance.defaults.headers.common['X-CSRF-TOKEN'] = this.csrfToken;

          // Сохраняем обновленный токен в конфигурацию
          this.config.csrfToken = this.csrfToken;
          CSMoneyService.saveConfig(this.config);
        } else {
          logger.warn('CSRF-токен не найден на странице.');
        }

        try {
          // Попытка получить баланс
          const balanceText = await this.page.evaluate(() => {
            const balanceElements = document.querySelectorAll('.balance, .user-balance, .user-panel__balance');
            for (const el of balanceElements) {
              if (el && el.textContent.trim()) {
                return el.textContent.trim();
              }
            }
            return null;
          });

          if (balanceText) {
            logger.info(`Текущий баланс на CS.Money: ${balanceText}`);
          } else {
            logger.warn('Баланс не найден на странице, но авторизация успешна');
          }
        } catch (error) {
          logger.warn(`Не удалось получить баланс: ${error.message}`);
        }
      } else {
        logger.error('Не удалось авторизоваться на CS.Money. Проверьте cookies.');
        // Дополнительный анализ страницы для выявления причины проблем
        const pageContent = await this.page.content();
        if (pageContent.includes('captcha') || pageContent.includes('cloudflare')) {
          logger.error('Обнаружена защита Cloudflare или капча');
        }
      }
      return isLoggedIn;

    } catch (error) {
      logger.error(`Ошибка при проверке авторизации: ${error.message}`);
      this.isLoggedIn = false;
      return false;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      logger.info('Браузер закрыт');
    }
  }

  // Метод для получения списка предметов с CS.Money
  async getItems(offset = 0, limit = 60) {
    try {
      if (!this.isLoggedIn) {
        await this.initialize();
        // Даже если не авторизованы, все равно продолжаем
        logger.warn('Не авторизован на CS.Money. Продолжаем без авторизации.');
      }

      logger.info(`Запрос предметов с CS.Money (offset: ${offset}, limit: ${limit})...`);

      // Используем современный API CS.Money (может меняться)
      // Добавляем случайный parameter для обхода кеширования
      const timestamp = Date.now();
      const apiUrl = `/2.0/market/sell-orders?limit=${limit}&offset=${offset}&order=asc&sort=price&_=${timestamp}`;

      try {
        // Сначала пробуем через API
        const response = await this.axiosInstance.get(apiUrl);

        if (response.data && Array.isArray(response.data.items)) {
          logger.info(`Получено ${response.data.items.length} предметов с CS.Money через API`);

          // Преобразуем формат данных для совместимости с остальным кодом
          const formattedItems = response.data.items.map(item => {
            return {
              id: item.id,
              name: item.asset?.names?.full || item.asset?.names?.market || '',
              fullName: item.asset?.names?.full || '',
              price: item.pricing?.default || 0,
              float: item.asset?.float || null,
              image: item.asset?.images?.steam || '',
              type: item.asset?.type || '',
              rarity: item.asset?.rarity || '',
              quality: item.asset?.quality || '',
              tags: item.asset?.tags || {},
              is_tradable: !item.isMySellOrder,
              in_stock: true,
              assetId: item.asset?.id || null
            };
          });

          return {
            success: true,
            items: formattedItems,
            total: response.data.meta?.total || formattedItems.length,
            rawItems: response.data.items
          };
        }
      } catch (apiError) {
        logger.warn(`Ошибка API для получения предметов: ${apiError.message}. Пробуем через парсинг страницы...`);
      }

      // Если API не сработал, пробуем через парсинг страницы
      try {
        await this.page.goto(`https://cs.money/ru/market/buy/?limit=${limit}&offset=${offset}`, {
          waitUntil: 'networkidle2',
          timeout: 60000
        });

        // Ждем загрузки предметов на странице
        await this.page.waitForSelector('.market-items__item, .item-card', { timeout: 30000 });

        // Парсим предметы со страницы
        const itemsFromPage = await this.page.evaluate(() => {
          const items = [];
          const itemElements = document.querySelectorAll('.market-items__item, .item-card');

          itemElements.forEach((itemEl, index) => {
            try {
              const nameEl = itemEl.querySelector('.item-card__name, .market-items__item-name');
              const priceEl = itemEl.querySelector('.item-card__price, .market-items__item-price');

              // Получаем ID из атрибутов элемента
              const id = itemEl.getAttribute('data-id') || itemEl.getAttribute('data-item-id') || `parsed_${index}`;
              const image = itemEl.querySelector('img')?.src || '';

              items.push({
                id: id,
                name: nameEl?.textContent.trim() || `Item ${index+1}`,
                price: parseFloat(priceEl?.textContent.replace(/[^\d.,]/g, '').replace(',', '.')) || 0,
                image: image,
                in_stock: true
              });
            } catch (err) {
              console.error('Ошибка при парсинге элемента:', err);
            }
          });

          return items;
        });

        if (itemsFromPage.length > 0) {
          logger.info(`Получено ${itemsFromPage.length} предметов с CS.Money через парсинг страницы`);
          return {
            success: true,
            items: itemsFromPage,
            total: itemsFromPage.length
          };
        }

        logger.warn('Не удалось получить предметы ни через API, ни через парсинг страницы');
        return {
          success: false,
          message: 'Не удалось получить предметы с CS.Money',
          items: []
        };

      } catch (pageError) {
        logger.error(`Ошибка при получении предметов через страницу: ${pageError.message}`);
        return {
          success: false,
          message: pageError.message,
          items: []
        };
      }
    } catch (error) {
      logger.error('Ошибка при запросе предметов с CS.Money:', error);
      return {
        success: false,
        message: error.message,
        items: []
      };
    }
  }

  // Метод для получения детальной информации о предмете по ID
  async getItemDetails(itemId) {
    try {
      if (!this.isLoggedIn) {
        await this.initialize();
      }

      logger.info(`Запрос деталей предмета ID: ${itemId}...`);
      const response = await this.axiosInstance.get(`/2.0/market/item/${itemId}`);

      if (response.data && response.data.item) {
        logger.info(`Получены детали предмета ID: ${itemId}`);
        return {
          success: true,
          item: response.data.item
        };
      } else {
        logger.warn(`Ошибка получения деталей предмета ID: ${itemId}`);
        return {
          success: false,
          message: 'Предмет не найден или неверный формат ответа'
        };
      }
    } catch (error) {
      logger.error(`Ошибка при запросе деталей предмета ID: ${itemId}:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Метод для поиска предмета по названию
  async searchItem(marketHashName, exterior) {
    try {
      if (!this.isLoggedIn) {
        await this.initialize();
      }

      // Форматируем название для поиска
      let name = marketHashName;
      if (exterior) {
        name = name.replace(/ \(Factory New\)| \(Minimal Wear\)| \(Field-Tested\)| \(Well-Worn\)| \(Battle-Scarred\)/g, '');
      }

      logger.info(`Поиск предмета на CS.Money: ${name} (${exterior || 'любой износ'})...`);

      // Используем обновленный API поиска CS.Money
      const searchUrl = `/2.0/market/search?q=${encodeURIComponent(name)}&limit=20`;
      const response = await this.axiosInstance.get(searchUrl);

      if (response.data && Array.isArray(response.data.items)) {
        const items = response.data.items;
        logger.info(`Найдено ${items.length} предметов по запросу "${name}"`);

        // Преобразуем формат данных
        const formattedItems = items.map(item => {
          return {
            id: item.id,
            name: item.asset?.names?.full || item.asset?.names?.market || '',
            price: item.pricing?.default || 0,
            float: item.asset?.float || null,
            image: item.asset?.images?.steam || '',
            assetId: item.asset?.id || null
          };
        });

        // Ищем точное соответствие
        let exactMatch = null;
        if (exterior) {
          exactMatch = formattedItems.find(item =>
            item.name.includes(name) && item.name.includes(exterior)
          );
        } else {
          exactMatch = formattedItems.find(item =>
            item.name === marketHashName
          );
        }

        if (exactMatch) {
          logger.info(`Найдено точное соответствие: ${exactMatch.name} (ID: ${exactMatch.id})`);

          // Получаем детальную информацию о предмете
          const detailsResponse = await this.getItemDetails(exactMatch.id);
          if (detailsResponse.success) {
            return {
              success: true,
              goods_id: exactMatch.id,
              market_hash_name: exactMatch.name,
              items: [
                {
                  id: exactMatch.id,
                  price: exactMatch.price,
                  name: exactMatch.name,
                  float: exactMatch.float || null,
                  image: exactMatch.image || null
                }
              ]
            };
          }
        }

        // Если точное соответствие не найдено, возвращаем первый предмет из списка
        if (formattedItems.length > 0) {
          logger.info(`Точное соответствие не найдено, возвращаем первый предмет: ${formattedItems[0].name}`);
          return {
            success: true,
            goods_id: formattedItems[0].id,
            market_hash_name: formattedItems[0].name,
            items: [formattedItems[0]]
          };
        }
      }

      logger.warn(`Предмет "${name}" не найден на CS.Money`);
      return {
        success: false,
        message: 'Предмет не найден'
      };
    } catch (error) {
      logger.error(`Ошибка при поиске предмета "${marketHashName}":`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Метод для покупки предмета
  async buyItem(itemId, assetId, price) {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на CS.Money для покупки предмета');
      }
    }

    logger.info(`Покупка предмета на CS.Money: Item ID ${itemId}, Asset ID ${assetId}, Цена ${price}`);

    try {
      // URL для покупки предмета
      const buyUrl = '/2.0/market/buy';

      // Данные для запроса
      const data = {
        id: itemId,
        assetId: assetId,
        price: price,
        _csrf: this.csrfToken
      };

      // Отправляем запрос на покупку
      const response = await this.axiosInstance.post(buyUrl, data);

      if (response.data && response.data.success) {
        logger.info(`Предмет успешно куплен: ${response.data.orderID || 'Нет ID заказа'}`);
        return {
          success: true,
          bill_no: response.data.orderID || String(Date.now()),
          data: response.data
        };
      } else {
        logger.warn(`Ошибка покупки предмета: ${response.data.message || JSON.stringify(response.data)}`);
        return {
          success: false,
          message: response.data.message || 'Неизвестная ошибка',
          error_type: response.data.error || 'unknown',
          data: response.data
        };
      }
    } catch (error) {
      logger.error(`Ошибка при покупке предмета (ID: ${itemId}):`, error);
      throw error;
    }
  }

  // Метод для получения баланса
  async getBalance() {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        return {
          success: false,
          message: 'Не авторизован на CS.Money'
        };
      }
    }

    try {
      // Получаем баланс со страницы
      await this.page.goto('https://cs.money/ru/market/buy/', { waitUntil: 'networkidle2', timeout: 30000 });

      const balance = await this.page.evaluate(() => {
        const balanceEl = document.querySelector('.balance');
        if (balanceEl) {
          // Извлекаем только число из текста
          const balanceText = balanceEl.textContent.trim();
          const balanceMatch = balanceText.match(/\d+(\.\d+)?/);
          return balanceMatch ? parseFloat(balanceMatch[0]) : 0;
        }
        return 0;
      });

      logger.info(`Текущий баланс на CS.Money: ${balance}`);
      return {
        success: true,
        balance: balance
      };
    } catch (error) {
      logger.error('Ошибка при получении баланса CS.Money:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Метод для проверки статуса доставки предмета
  async checkItemDeliveryStatus(orderId) {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        return {
          success: false,
          message: 'Не авторизован на CS.Money'
        };
      }
    }

    try {
      logger.info(`Проверка статуса доставки заказа ${orderId} на CS.Money...`);

      // Проверяем статус заказа
      const response = await this.axiosInstance.get(`/2.0/market/order/${orderId}`);

      if (response.data && response.data.order) {
        const orderStatus = response.data.order.status;
        logger.info(`Статус заказа ${orderId}: ${orderStatus}`);

        return {
          success: true,
          status: orderStatus,
          is_delivered: orderStatus === 'delivered' || orderStatus === 'completed',
          data: response.data.order
        };
      } else {
        logger.warn(`Ошибка получения статуса заказа ${orderId}: ${JSON.stringify(response.data)}`);
        return {
          success: false,
          message: 'Неверный формат ответа'
        };
      }
    } catch (error) {
      logger.error(`Ошибка при проверке статуса заказа ${orderId}:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Импорт предметов в базу данных
  async importItemsToDb(items) {
    for (const itemData of items) {
      try {
        // Поиск существующего предмета по уникальному идентификатору
        const existingItem = await Item.findOne({
          where: {
            [Op.or]: [
              { csmoney_id: itemData.id },
              { steam_market_hash_name: itemData.name }
            ]
          }
        });

        // Определение редкости предмета
        const rarityMap = {
          'common': 'consumer',
          'uncommon': 'industrial',
          'rare': 'milspec',
          'mythical': 'restricted',
          'legendary': 'covert',
          'ancient': 'exotic',
          'immortal': 'contraband'
        };

        // Определение качества износа
        let exterior = null;
        if (itemData.name) {
          const exteriorMatch = itemData.name.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/);
          if (exteriorMatch) {
            exterior = exteriorMatch[1];
          }
        }

        // Данные для создания/обновления предмета
        const data = {
          name: itemData.name,
          steam_market_hash_name: itemData.name,
          price: itemData.price || 0,
          image_url: itemData.image || '',
          csmoney_id: itemData.id,
          exterior: exterior,
          float_value: itemData.float || null,
          rarity: rarityMap[itemData.rarity] || 'consumer',
          weapon_type: itemData.type || null,
          csmoney_tags: itemData.tags || {},
          asset_id: itemData.assetId || null,
          is_tradable: itemData.is_tradable !== false,
          in_stock: itemData.in_stock !== false
        };

        if (existingItem) {
          // Обновление существующего предмета
          await existingItem.update(data);
          logger.info(`Обновлен предмет: ${itemData.name}`);
        } else {
          // Создание нового предмета
          await Item.create(data);
          logger.info(`Создан новый предмет: ${itemData.name}`);
        }
      } catch (error) {
        logger.error(`Ошибка при импорте предмета ${itemData.name}:`, error);
      }
    }
  }

  static loadConfig() {
    const configPath = path.join(__dirname, '../config/csmoney_config.json');
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        logger.info('Конфигурация CS.Money загружена');
        return config;
      }
    } catch (error) {
      logger.error('Ошибка при загрузке конфигурации CS.Money:', error);
    }
    return { cookies: '', csrfToken: '', sessionId: '' };
  }

  static saveConfig(config) {
    const configPath = path.join(__dirname, '../config/csmoney_config.json');
    try {
      // Добавляем дату последнего обновления
      config.lastUpdated = new Date().toISOString();
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      logger.info('Конфигурация CS.Money сохранена');
      return true;
    } catch (error) {
      logger.error('Ошибка при сохранении конфигурации CS.Money:', error);
      return false;
    }
  }
}

module.exports = CSMoneyService;
