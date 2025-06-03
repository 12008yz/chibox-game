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
        'User-Agent': this.config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 YaBrowser/24.10.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://cs.money/ru/market/sell-orders/',
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

    // Устанавливаем User-Agent из конфигурации
    const userAgent = this.config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 YaBrowser/24.10.0.0 Safari/537.36';
    await this.page.setUserAgent(userAgent);

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
                let domain = '.cs.money';
                let path = '/';
                let httpOnly = false;
                let secure = false;

                // Cloudflare cookies
                if (name === 'cf_clearance') {
                  domain = '.cs.money';
                  httpOnly = true;
                  secure = true;
                }
                // CS.Money session cookies
                else if (name === 'csgo_ses' || name === 'support_token') {
                  domain = 'cs.money';
                  httpOnly = true;
                }
                // Session-specific cookies
                else if (name.includes('seconds_on_page_') || name.includes('was_called_in_current_session_') ||
                         name === 'csp-nonce' || name === 'settings_visual_card_size' ||
                         name === 'u_dpi' || name === 'u_vp') {
                  domain = 'cs.money';
                }
                // Yandex cookies
                else if (name.includes('_ym_') || name.includes('yandex') || name.includes('Session_id') ||
                         name.includes('sessionid') || name.includes('yashr') || name.includes('yp') ||
                         name.includes('ys') || name.includes('yuidss') || name.includes('bh') ||
                         name.includes('cycada') || name.includes('font_loaded') || name.includes('gdpr') ||
                         name.includes('gpb') || name.includes('i') || name.includes('is_gdpr') ||
                         name.includes('isa') || name.includes('my') || name.includes('sae') ||
                         name.includes('sessar') || name.includes('skid') || name.includes('ymex')) {
                  domain = '.yandex.ru';
                  if (name.includes('Session_id') || name.includes('sessionid') || name.includes('sessar')) {
                    httpOnly = true;
                    secure = true;
                  }
                }
                // Other tracking cookies
                else if (name.includes('_ga') || name.includes('_fb') || name.includes('_gcl') ||
                         name.includes('_sc') || name.includes('_uet') || name.includes('amplitude') ||
                         name.includes('_hj') || name.includes('AMP_')) {
                  domain = '.cs.money';
                }

                cookiesArr.push({
                  name,
                  value,
                  domain,
                  path,
                  httpOnly,
                  secure
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
      // await this.page.screenshot({ path: 'csmoney-login-check.png' });
      // logger.info('Сделан скриншот страницы для проверки (csmoney-login-check.png)');

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
      // Для импорта используем только API, браузер не инициализируем для производительности
      logger.info('Импорт предметов через CSMoney API (без браузера для оптимизации)');

      logger.info(`Запрос предметов с CS.Money (offset: ${offset}, limit: ${limit})...`);

      // Используем современный API CS.Money (может меняться)
      // Добавляем случайный parameter для обхода кеширования
      const timestamp = Date.now();

      const apiUrl = `/2.0/market/sell-orders?limit=${limit}&offset=${offset}&deliverySpeed=instant`;

      try {
        // Добавляем задержку между запросами для избежания блокировки
        if (offset > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        }

        logger.info(`Запрос к API: ${apiUrl}`);
        const response = await this.axiosInstance.get(apiUrl);

        if (response.data && Array.isArray(response.data.items)) {
          logger.info(`Получено ${response.data.items.length} предметов с CS.Money через API`);

          // Преобразуем формат данных для совместимости с остальным кодом
          const formattedItems = response.data.items.map(item => {
            // Определяем качество износа из названия
            let exterior = null;
            const fullName = item.asset?.names?.full || '';
            if (fullName.includes('Factory New')) exterior = 'Factory New';
            else if (fullName.includes('Minimal Wear')) exterior = 'Minimal Wear';
            else if (fullName.includes('Field-Tested')) exterior = 'Field-Tested';
            else if (fullName.includes('Well-Worn')) exterior = 'Well-Worn';
            else if (fullName.includes('Battle-Scarred')) exterior = 'Battle-Scarred';

            return {
              id: item.id,
              name: fullName,
              fullName: fullName,
              price: item.pricing?.computed || item.pricing?.default || 0,
              float: item.asset?.float || null,
              image: item.asset?.images?.steam || item.asset?.images?.screenshot || '',
              type: this.getWeaponType(fullName),
              rarity: item.asset?.rarity || '',
              quality: item.asset?.quality || '',
              exterior: exterior,
              pattern: item.asset?.pattern || null,
              stickers: item.stickers || [],
              keychains: item.keychains || [],
              isStatTrak: item.asset?.isStatTrak || false,
              isSouvenir: item.asset?.isSouvenir || false,
              tags: item.asset?.tags || {},
              is_tradable: !item.isMySellOrder,
              in_stock: true,
              assetId: item.asset?.id || null,
              sellerId: item.seller?.botId || null,
              inspectLink: item.links?.inspectLink || null,
              rawItem: item // Сохраняем оригинальные данные для отладки
            };
          });

          return {
            success: true,
            items: formattedItems,
            total: response.data.items.length,
            hasMore: response.data.items.length === limit,
            rawItems: response.data.items
          };
        }
      } catch (apiError) {
        logger.error(`Ошибка API для получения предметов: ${apiError.message}`);
        logger.info('API недоступен. Завершаем импорт без браузерного парсинга.');

        return {
          success: false,
          message: `API недоступен: ${apiError.message}`,
          items: []
        };
      }

      // Код браузерного парсинга удален для оптимизации импорта - используем только API
      logger.warn('Импорт использует только API метод для максимальной производительности');

      /*
      // ОТКЛЮЧЕННЫЙ КОД: Браузерный парсинг (слишком медленный для массового импорта)
      try {
        await this.page.goto(\`https://cs.money/ru/market/buy/\`, {
          waitUntil: 'networkidle2',
          timeout: 60000
        });

        await this.page.waitForSelector('.market-items__item, .item-card', { timeout: 30000 });

        let previousItemCount = 0;
        let currentItemCount = 0;
        let noNewItemsCount = 0;
        const maxScrollAttempts = 100;
        const scrollDelay = 3000;
        const maxNoNewItems = 3;

        logger.info('Начинаем интеллектуальную прокрутку для загрузки всех предметов...');

        for (let scrollAttempt = 0; scrollAttempt < maxScrollAttempts; scrollAttempt++) {
          // Считаем текущее количество предметов
          currentItemCount = await this.page.evaluate(() => {
            return document.querySelectorAll('.market-items__item, .item-card').length;
          });

          logger.info(`Попытка прокрутки ${scrollAttempt + 1}/${maxScrollAttempts}: найдено ${currentItemCount} предметов`);

          // Если количество предметов не изменилось, увеличиваем счетчик
          if (currentItemCount === previousItemCount) {
            noNewItemsCount++;
            logger.info(`Новые предметы не загрузились (${noNewItemsCount}/${maxNoNewItems})`);

            if (noNewItemsCount >= maxNoNewItems) {
              logger.info('Достигнут лимит попыток без новых предметов. Завершаем прокрутку.');
              break;
            }
          } else {
            // Сбрасываем счетчик если загрузились новые предметы
            noNewItemsCount = 0;
            logger.info(`Загружено ${currentItemCount - previousItemCount} новых предметов`);
          }

          previousItemCount = currentItemCount;

          // Прокручиваем страницу вниз плавно
          await this.page.evaluate(() => {
            // Прокручиваем до конца страницы
            window.scrollTo(0, document.body.scrollHeight);
          });

          // Ждем загрузки новых предметов
          await new Promise(resolve => setTimeout(resolve, scrollDelay));

          // Дополнительно ждем появления новых элементов
          try {
            await this.page.waitForFunction(
              (prevCount) => document.querySelectorAll('.market-items__item, .item-card').length > prevCount,
              { timeout: 5000 },
              currentItemCount
            );
            logger.info('Обнаружены новые предметы после прокрутки');
          } catch (waitError) {
            logger.info('Новые предметы не появились в течение 5 секунд');
          }
        }

        logger.info(`Завершена прокрутка. Итого найдено: ${currentItemCount} предметов`);

        // Парсим предметы со страницы с улучшенной логикой
        const itemsFromPage = await this.page.evaluate(() => {
          const items = [];
          // Расширенный список селекторов для поиска предметов
          const itemSelectors = [
            '.market-items__item',
            '.item-card',
            '[data-testid="market-item"]',
            '.cs-market-item',
            '.market-item',
            '.item'
          ];

          let itemElements = [];

          // Пробуем разные селекторы
          for (const selector of itemSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              itemElements = elements;
              console.log(`Найдено ${elements.length} предметов с селектором: ${selector}`);
              break;
            }
          }

          if (itemElements.length === 0) {
            console.warn('Не удалось найти предметы ни с одним селектором');
            return [];
          }

          itemElements.forEach((itemEl, index) => {
            try {
              // Расширенный список селекторов для названия
              const nameSelectors = [
                '.item-card__name',
                '.market-items__item-name',
                '.item-name',
                '.name',
                '[data-testid="item-name"]',
                '.cs-item-name'
              ];

              // Расширенный список селекторов для цены
              const priceSelectors = [
                '.item-card__price',
                '.market-items__item-price',
                '.item-price',
                '.price',
                '[data-testid="item-price"]',
                '.cs-item-price'
              ];

              let nameEl = null;
              let priceEl = null;

              // Ищем название
              for (const selector of nameSelectors) {
                nameEl = itemEl.querySelector(selector);
                if (nameEl) break;
              }

              // Ищем цену
              for (const selector of priceSelectors) {
                priceEl = itemEl.querySelector(selector);
                if (priceEl) break;
              }

              // Получаем ID из различных атрибутов
              const id = itemEl.getAttribute('data-id') ||
                        itemEl.getAttribute('data-item-id') ||
                        itemEl.getAttribute('data-testid') ||
                        itemEl.getAttribute('id') ||
                        `parsed_${Date.now()}_${index}`;

              // Ищем изображение
              const image = itemEl.querySelector('img')?.src ||
                           itemEl.querySelector('img')?.getAttribute('data-src') ||
                           '';

              // Извлекаем текст названия
              const itemName = nameEl?.textContent?.trim() ||
                              nameEl?.innerText?.trim() ||
                              itemEl.getAttribute('title') ||
                              `Item ${index + 1}`;

              // Извлекаем и парсим цену
              let itemPrice = 0;
              if (priceEl) {
                const priceText = priceEl.textContent || priceEl.innerText || '';
                const priceMatch = priceText.match(/[\d.,]+/);
                if (priceMatch) {
                  itemPrice = parseFloat(priceMatch[0].replace(',', '.')) || 0;
                }
              }

              // Дополнительная информация
              const rarityEl = itemEl.querySelector('.rarity, .item-rarity, [data-rarity]');
              const typeEl = itemEl.querySelector('.type, .item-type, [data-type]');

              items.push({
                id: id,
                name: itemName,
                price: itemPrice,
                image: image,
                rarity: rarityEl?.textContent?.trim() || rarityEl?.getAttribute('data-rarity') || '',
                type: typeEl?.textContent?.trim() || typeEl?.getAttribute('data-type') || '',
                in_stock: true,
                is_tradable: true
              });

            } catch (err) {
              console.error('Ошибка при парсинге элемента:', err);
            }
          });

          return items;
        });

        if (itemsFromPage.length > 0) {
          logger.info(\`Получено \${itemsFromPage.length} предметов с CS.Money через парсинг страницы\`);
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
        logger.error(\`Ошибка при получении предметов через страницу: \${pageError.message}\`);
        return {
          success: false,
          message: pageError.message,
          items: []
        };
      }
      */ // КОНЕЦ ОТКЛЮЧЕННОГО БРАУЗЕРНОГО КОДА
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

      // Попробуем разные варианты поиска
      const encodedName = encodeURIComponent(name);

      // Используем правильный API endpoint с параметром name
      const searchUrl = `https://cs.money/2.0/market/sell-orders?limit=60&offset=0&name=${encodedName}`;

      logger.info(`Переход к URL поиска через браузер: ${searchUrl}`);
      await this.page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Получаем JSON ответ со страницы
      let response = await this.page.evaluate(() => {
        try {
          const bodyText = document.body.innerText;
          console.log('Raw body text:', bodyText.substring(0, 500)); // Логируем первые 500 символов
          return JSON.parse(bodyText);
        } catch (error) {
          console.log('JSON parse error:', error.message);
          console.log('Document body HTML:', document.body.innerHTML.substring(0, 500));
          return null;
        }
      });

      logger.info(`Ответ поиска CS.Money: ${JSON.stringify(response).substring(0, 200)}`);

      // Если поиск по name не сработал, попробуем без параметров и отфильтруем на клиенте
      if (!response || !Array.isArray(response.items) || response.items.length === 0) {
        logger.info('Поиск с параметрами не дал результатов, пробуем общий список...');
        const fallbackUrl = `https://cs.money/2.0/market/sell-orders?limit=200&offset=0`;
        await this.page.goto(fallbackUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        response = await this.page.evaluate(() => {
          try {
            const bodyText = document.body.innerText;
            return JSON.parse(bodyText);
          } catch (error) {
            return null;
          }
        });

        logger.info(`Ответ общего списка CS.Money: найдено ${response?.items?.length || 0} предметов`);
      }

      if (response && Array.isArray(response.items)) {
        const items = response.items;
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

        // Ищем точное соответствие с улучшенной логикой
        let exactMatch = null;

        // Сначала пытаемся найти точное соответствие полного названия
        exactMatch = formattedItems.find(item =>
          item.name === marketHashName
        );

        // Если не найдено, ищем по базовому названию с износом
        if (!exactMatch && exterior) {
          exactMatch = formattedItems.find(item =>
            item.name.includes(name) &&
            item.name.includes(exterior) &&
            !item.name.toLowerCase().includes('sticker') &&
            !item.name.toLowerCase().includes('case') &&
            !item.name.toLowerCase().includes('key')
          );
        }

        // Если все еще не найдено, ищем только по базовому названию (без износа)
        if (!exactMatch) {
          exactMatch = formattedItems.find(item =>
            item.name.includes(name) &&
            !item.name.toLowerCase().includes('sticker') &&
            !item.name.toLowerCase().includes('case') &&
            !item.name.toLowerCase().includes('key')
          );
        }

        if (exactMatch) {
          logger.info(`Найдено соответствие: ${exactMatch.name} (ID: ${exactMatch.id})`);

          // Возвращаем результат сразу, без запроса деталей (избегаем 403 ошибку)
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

        // Если точное соответствие не найдено, не возвращаем случайный предмет
        if (formattedItems.length > 0) {
          logger.warn(`Точное соответствие для "${marketHashName}" не найдено среди ${formattedItems.length} результатов. Найденные предметы: ${formattedItems.slice(0, 3).map(item => item.name).join(', ')}`);
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
      // Получаем баланс со страницы через браузер
      await this.page.goto('https://cs.money/ru/market/buy/', { waitUntil: 'networkidle2', timeout: 30000 });

      const balance = await this.page.evaluate(() => {
        // Расширенный поиск элемента баланса
        const balanceSelectors = [
          '.balance',
          '.user-balance',
          '.user-panel__balance',
          '.profile-balance',
          '[data-testid="balance"]',
          '.wallet-balance'
        ];

        for (const selector of balanceSelectors) {
          const balanceEl = document.querySelector(selector);
          if (balanceEl) {
            // Извлекаем только число из текста
            const balanceText = balanceEl.textContent.trim();
            const balanceMatch = balanceText.match(/\d+(\.\d+)?/);
            if (balanceMatch) {
              return parseFloat(balanceMatch[0]);
            }
          }
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

  // Вспомогательный метод для определения типа оружия
  getWeaponType(itemName) {
    if (!itemName) return 'Unknown';

    const name = itemName.toLowerCase();

    // Ножи
    if (name.includes('knife') || name.includes('bayonet') || name.includes('karambit') ||
        name.includes('butterfly') || name.includes('flip') || name.includes('gut') ||
        name.includes('huntsman') || name.includes('falchion') || name.includes('bowie') ||
        name.includes('shadow daggers') || name.includes('navaja') || name.includes('stiletto') ||
        name.includes('ursus') || name.includes('talon') || name.includes('cleaver') ||
        name.includes('classic') || name.includes('paracord') || name.includes('survival') ||
        name.includes('nomad') || name.includes('skeleton') || name.includes('kukri')) {
      return 'Knife';
    }

    // Перчатки
    if (name.includes('gloves')) {
      return 'Gloves';
    }

    // Винтовки
    if (name.includes('ak-47') || name.includes('m4a4') || name.includes('m4a1-s') ||
        name.includes('awp') || name.includes('ssg 08') || name.includes('scar-20') ||
        name.includes('g3sg1') || name.includes('aug') || name.includes('sg 553') ||
        name.includes('famas') || name.includes('galil ar')) {
      return 'Rifle';
    }

    // Пистолеты
    if (name.includes('glock-18') || name.includes('usp-s') || name.includes('p2000') ||
        name.includes('p250') || name.includes('tec-9') || name.includes('five-seven') ||
        name.includes('cz75-auto') || name.includes('desert eagle') || name.includes('dual berettas') ||
        name.includes('r8 revolver')) {
      return 'Pistol';
    }

    // ПП
    if (name.includes('mp9') || name.includes('mac-10') || name.includes('pp-bizon') ||
        name.includes('ump-45') || name.includes('p90') || name.includes('mp7') ||
        name.includes('mp5-sd')) {
      return 'SMG';
    }

    // Дробовики
    if (name.includes('nova') || name.includes('xm1014') || name.includes('sawed-off') ||
        name.includes('mag-7')) {
      return 'Shotgun';
    }

    // Пулеметы
    if (name.includes('m249') || name.includes('negev')) {
      return 'Machinegun';
    }

    return 'Other';
  }

  // Импорт предметов в базу данных
  async importItemsToDb(items) {
    for (const itemData of items) {
      try {
        // Поиск существующего предмета по csmoney_id
        const existingItem = await Item.findOne({
          where: {
            csmoney_id: itemData.id
          }
        });

        // Определение редкости предмета (правильное мапирование для CS:GO)
        const rarityMap = {
          'consumer': 'consumer',
          'industrial': 'industrial',
          'mil-spec': 'milspec',
          'milspec': 'milspec',
          'restricted': 'restricted',
          'classified': 'classified',
          'covert': 'covert',
          'contraband': 'contraband',
          'exotic': 'exotic'
        };

        // Определение качества износа
        let exterior = null;
        if (itemData.name) {
          const exteriorMatch = itemData.name.match(/\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)/);
          if (exteriorMatch) {
            exterior = exteriorMatch[1];
          }
        }

        // Извлекаем weapon_type и skin_name из названия
        let weapon_type = null;
        let skin_name = null;
        if (itemData.name) {
          // Для ножей
          if (itemData.name.includes('★')) {
            const knifeMatch = itemData.name.match(/★\s*([^|]+)\s*\|\s*([^(]+)/);
            if (knifeMatch) {
              weapon_type = knifeMatch[1].trim();
              skin_name = knifeMatch[2].trim();
            }
          } else {
            // Для обычного оружия
            const weaponMatch = itemData.name.match(/^([^|]+)\s*\|\s*([^(]+)/);
            if (weaponMatch) {
              weapon_type = weaponMatch[1].trim();
              skin_name = weaponMatch[2].trim();
            }
          }
        }

        // Данные для создания/обновления предмета
        const data = {
          name: itemData.name,
          steam_market_hash_name: itemData.name,
          price: parseFloat(itemData.price) || 0,
          image_url: itemData.image || '',
          csmoney_id: itemData.id,
          exterior: itemData.exterior || exterior,
          float_value: itemData.float || null,
          rarity: rarityMap[itemData.rarity?.toLowerCase()] || 'consumer',
          weapon_type: weapon_type || itemData.type || null,
          skin_name: skin_name,
          asset_id: itemData.assetId ? String(itemData.assetId) : null,
          is_tradable: itemData.is_tradable !== false,
          in_stock: itemData.in_stock !== false,
          stickers: itemData.stickers ? JSON.stringify(itemData.stickers) : null,
          quality: itemData.isStatTrak ? 'StatTrak' : (itemData.isSouvenir ? 'Souvenir' : null)
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
        logger.error('Детали ошибки:', error.stack);
        // Не останавливаем весь процесс из-за одной ошибки
        continue;
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
