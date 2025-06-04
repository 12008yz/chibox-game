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
        'Accept': '*/*',
        'Accept-Language': 'ru,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "YaBrowser";v="24.10", "Yowser";v="2.5"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://cs.money/ru/market/buy/',
        'Origin': 'https://cs.money',
        'Priority': 'u=1, i',
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

      // Ждем дополнительное время для полной загрузки
      await this.page.waitForTimeout(3000);

      const balance = await this.page.evaluate(() => {
        // Новые селекторы для актуального HTML CS.Money
        const balanceSelectors = [
          // Основные селекторы для новой структуры
          '.csm_77ec012e .csm_541445e7', // Класс из вашего HTML
          '.csm_541445e7', // Прямой класс суммы
          // Старые селекторы на всякий случай
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
            const balanceText = balanceEl.textContent.trim();
            console.log(`Найден элемент баланса с селектором ${selector}: "${balanceText}"`);

            // Ищем доллары ($ 1.20) или просто числа
            let balanceMatch = balanceText.match(/\$\s*(\d+(?:\.\d+)?)/);
            if (balanceMatch) {
              console.log(`Найден баланс в долларах: ${balanceMatch[1]}`);
              return parseFloat(balanceMatch[1]);
            }

            // Если не нашли доллары, ищем просто число
            balanceMatch = balanceText.match(/(\d+(?:\.\d+)?)/);
            if (balanceMatch) {
              console.log(`Найден числовой баланс: ${balanceMatch[1]}`);
              return parseFloat(balanceMatch[1]);
            }
          }
        }

        // Дополнительный поиск по всем элементам, содержащим $ и число
        const allElements = document.querySelectorAll('*');
        for (const element of allElements) {
          if (element.children.length === 0) { // Только текстовые элементы
            const text = element.textContent.trim();
            const dollarMatch = text.match(/^\$\s*(\d+(?:\.\d+)?)$/);
            if (dollarMatch) {
              console.log(`Найден баланс через поиск по всем элементам: ${dollarMatch[1]}`);
              return parseFloat(dollarMatch[1]);
            }
          }
        }

        console.log('Баланс не найден, возвращаем 0');
        return 0;
      });

      // Дополнительное логирование для отладки
      const pageInfo = await this.page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          bodyText: document.body.textContent.substring(0, 500),
          csm77_elements: document.querySelectorAll('.csm_77ec012e').length,
          csm541_elements: document.querySelectorAll('.csm_541445e7').length,
          dollar_signs: (document.body.textContent.match(/\$/g) || []).length
        };
      });

      logger.info('Информация о странице CS.Money:', JSON.stringify(pageInfo, null, 2));
      logger.info(`Текущий баланс на CS.Money через парсинг: ${balance}`);

      // Если парсинг не сработал, попробуем API запрос
      if (balance === 0) {
        logger.info('Парсинг баланса вернул 0, пробуем получить через API...');
        try {
          const apiBalance = await this.getBalanceViaAPI();
          if (apiBalance.success && apiBalance.balance > 0) {
            logger.info(`Баланс через API: ${apiBalance.balance}`);
            return apiBalance;
          }
        } catch (apiError) {
          logger.warn('API запрос баланса не удался:', apiError);
        }
      }

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

  // Альтернативный метод получения баланса через API
  async getBalanceViaAPI() {
    try {
      if (!this.isLoggedIn) {
        await this.initialize();
        if (!this.isLoggedIn) {
          return {
            success: false,
            message: 'Не авторизован на CS.Money'
          };
        }
      }

      // Пробуем различные API endpoints для получения информации о пользователе
      const endpoints = [
        '/2.0/user/profile',
        '/2.0/user/balance',
        '/2.0/user/info',
        '/api/user/balance',
        '/api/profile'
      ];

      for (const endpoint of endpoints) {
        try {
          logger.info(`Пробуем получить баланс через API endpoint: ${endpoint}`);
          const response = await this.axiosInstance.get(endpoint);

          if (response.data) {
            logger.info(`Ответ API ${endpoint}:`, JSON.stringify(response.data).substring(0, 500));

            // Ищем баланс в различных полях ответа
            const balanceFields = ['balance', 'money', 'wallet', 'usd', 'dollars', 'funds'];
            for (const field of balanceFields) {
              if (response.data[field] !== undefined) {
                const balanceValue = parseFloat(response.data[field]);
                if (!isNaN(balanceValue)) {
                  logger.info(`Найден баланс через API ${endpoint}, поле ${field}: ${balanceValue}`);
                  return {
                    success: true,
                    balance: balanceValue,
                    source: `API_${endpoint}_${field}`
                  };
                }
              }
            }

            // Ищем баланс в вложенных объектах
            if (typeof response.data === 'object') {
              const searchInObject = (obj, path = '') => {
                for (const [key, value] of Object.entries(obj)) {
                  const currentPath = path ? `${path}.${key}` : key;

                  if (typeof value === 'number' && balanceFields.some(field => key.toLowerCase().includes(field))) {
                    logger.info(`Найден баланс в вложенном объекте ${currentPath}: ${value}`);
                    return value;
                  }

                  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    const nestedResult = searchInObject(value, currentPath);
                    if (nestedResult !== null) return nestedResult;
                  }
                }
                return null;
              };

              const nestedBalance = searchInObject(response.data);
              if (nestedBalance !== null) {
                return {
                  success: true,
                  balance: nestedBalance,
                  source: `API_${endpoint}_nested`
                };
              }
            }
          }
        } catch (endpointError) {
          logger.warn(`API endpoint ${endpoint} не доступен:`, endpointError.message);
        }
      }

      return {
        success: false,
        message: 'Не удалось получить баланс ни через один API endpoint'
      };
    } catch (error) {
      logger.error('Ошибка при получении баланса через API:', error);
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

  // Новые методы для работы с корзиной CS.Money

  // Метод для добавления предмета в корзину (обновленный для актуального API)
  async addToCart(itemId, assetId) {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на CS.Money для добавления в корзину');
      }
    }

    logger.info(`Добавление предмета в корзину: Item ID ${itemId}, Asset ID ${assetId}`);

    try {
      // Используем правильный API endpoint из реальных запросов
      const addToCartUrl = '/1.0/market/cart/items';

      // Генерируем trace ID для отслеживания (как в реальных запросах)
      const traceId = this.generateTraceId();
      const spanId = this.generateSpanId();

      // Данные для запроса в формате, соответствующем реальным запросам
      const data = {
        itemId: itemId
      };

      // Обновленные заголовки на основе реальных запросов
      const headers = {
        ...this.axiosInstance.defaults.headers,
        'Content-Type': 'application/json',
        'x-client-app': 'web',
        'sentry-trace': `${traceId}-${spanId}-1`,
        'traceparent': `00-${traceId}-${spanId}-01`,
        'baggage': `sentry-environment=production,sentry-release=2025-06-03-0636-production,sentry-public_key=da19e2c6e5d741efbda9d313341ab6d6,sentry-trace_id=${traceId},sentry-sampled=true,sentry-sample_rand=0.14949963212859751,sentry-sample_rate=0.2`
      };

      // Отправляем запрос на добавление в корзину
      const response = await this.axiosInstance.post(addToCartUrl, data, { headers });

      if (response.status === 200) {
        logger.info(`Предмет успешно добавлен в корзину: Item ID ${itemId}`);

        // Отправляем также статус события для аналитики
        await this.sendStatusCartEvent(itemId, 'added_to_cart');

        return {
          success: true,
          item_id: itemId,
          data: response.data
        };
      } else {
        logger.warn(`Ошибка добавления предмета в корзину: ${response.data?.message || JSON.stringify(response.data)}`);
        return {
          success: false,
          message: response.data?.message || 'Неизвестная ошибка',
          error_type: response.data?.error || 'unknown',
          data: response.data
        };
      }
    } catch (error) {
      logger.error(`Ошибка при добавлении предмета в корзину (ID: ${itemId}):`, error);

      // Fallback на старый API в случае ошибки
      logger.info('Пробуем fallback на старый API корзины...');
      return await this.addToCartFallback(itemId, assetId);
    }
  }

  // Метод для отправки статуса корзины (аналитика)
  async sendStatusCartEvent(itemId, action) {
    try {
      const statusCartUrl = '/2.0/events/status-cart';
      const traceId = this.generateTraceId();
      const spanId = this.generateSpanId();

      // Создаем событие в том же формате, что и реальные запросы
      const eventData = {
        events: [
          {
            event_type: 'cart_interaction',
            user_id: this.config.steamId || null,
            item_id: itemId,
            action: action,
            timestamp: Date.now(),
            session_id: this.sessionId,
            platform: 'web'
          }
        ]
      };

      const headers = {
        ...this.axiosInstance.defaults.headers,
        'Content-Type': 'application/json',
        'x-client-app': 'web',
        'sentry-trace': `${traceId}-${spanId}-1`,
        'traceparent': `00-${traceId}-${spanId}-01`,
        'baggage': `sentry-environment=production,sentry-release=2025-06-03-0636-production,sentry-public_key=da19e2c6e5d741efbda9d313341ab6d6,sentry-trace_id=${traceId},sentry-sampled=true,sentry-sample_rand=0.14949963212859751,sentry-sample_rate=0.2`
      };

      await this.axiosInstance.post(statusCartUrl, eventData, { headers });
      logger.info(`Отправлено событие корзины: ${action} для предмета ${itemId}`);
    } catch (error) {
      logger.warn(`Не удалось отправить событие корзины: ${error.message}`);
      // Не прерываем выполнение, так как это только аналитика
    }
  }

  // Fallback метод с оригинальным API
  async addToCartFallback(itemId, assetId) {
    try {
      const addToCartUrl = '/2.0/market/cart/add';
      const data = {
        item_id: itemId,
        asset_id: assetId,
        _csrf: this.csrfToken
      };

      const response = await this.axiosInstance.post(addToCartUrl, data);

      if (response.data && response.data.success) {
        logger.info(`Предмет успешно добавлен в корзину через fallback API: ${response.data.cart_id || 'Нет ID корзины'}`);
        return {
          success: true,
          cart_id: response.data.cart_id,
          data: response.data
        };
      } else {
        return {
          success: false,
          message: response.data.message || 'Fallback API также не сработал',
          error_type: 'fallback_failed',
          data: response.data
        };
      }
    } catch (fallbackError) {
      logger.error('Fallback API также не сработал:', fallbackError);
      throw fallbackError;
    }
  }

  // Метод для получения содержимого корзины (обновленный)
  async getCart() {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на CS.Money для просмотра корзины');
      }
    }

    try {
      // Пробуем новый метод - через браузер, так как корзина может быть только в веб-интерфейсе
      const cartData = await this.getCartViaBrowser();
      if (cartData.success) {
        return cartData;
      }

      // Используем правильный API endpoint
      const response = await this.axiosInstance.get('/1.0/market/cart/items');

      if (response.data) {
        logger.info(`Получено содержимое корзины: ${response.data.items?.length || 0} предметов`);
        return {
          success: true,
          items: response.data.items || [],
          total_price: response.data.total_price || 0,
          data: response.data
        };
      } else {
        return {
          success: false,
          message: 'Неверный формат ответа корзины'
        };
      }
    } catch (error) {
      logger.error('Ошибка при получении корзины:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Метод для получения корзины через браузер
  async getCartViaBrowser() {
    try {
      if (!this.page) {
        logger.warn('Браузер не инициализирован для получения корзины');
        return { success: false, message: 'Браузер не инициализирован' };
      }

      // Переходим на страницу с корзиной или ищем элементы корзины на текущей странице
      await this.page.goto('https://cs.money/ru/market/buy/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Ждем загрузки корзины
      await this.page.waitForTimeout(3000);

      // Извлекаем данные корзины из DOM с обновленными селекторами
      const cartData = await this.page.evaluate(() => {
        // Ищем кнопку корзины для получения общей суммы
        const cartButton = document.querySelector('.csm_f3fc0850');
        if (!cartButton) {
          return { items: [], total_price: 0 };
        }

        // Извлекаем общую сумму из кнопки корзины
        const priceElement = cartButton.querySelector('.csm_541445e7');
        let total_price = 0;
        if (priceElement) {
          const priceText = priceElement.textContent.trim();
          // Убираем символы валюты и пробелы, заменяем запятую на точку
          const priceMatch = priceText.replace(/[^\d.,]/g, '').replace(',', '.');
          total_price = parseFloat(priceMatch) || 0;
        }

        // Пробуем найти детализированные товары в корзине
        // Обновленные селекторы для карточек товаров
        const itemCards = document.querySelectorAll('[data-testid="cart-item"], .cart-item, .csm_cart_item');
        const items = [];

        itemCards.forEach((card, index) => {
          try {
            const nameEl = card.querySelector('.item-name, .csm_item_name, [data-testid="item-name"]');
            const priceEl = card.querySelector('.csm_541445e7, .item-price, [data-testid="item-price"]');
            const imageEl = card.querySelector('img');
            const id = card.getAttribute('data-item-id') ||
                      card.getAttribute('data-card-id') ||
                      card.getAttribute('data-id') ||
                      `cart_item_${index}`;

            const name = nameEl ? nameEl.textContent.trim() : `Item ${index + 1}`;
            let price = 0;

            if (priceEl) {
              const priceText = priceEl.textContent.trim();
              const priceMatch = priceText.replace(/[^\d.,]/g, '').replace(',', '.');
              price = parseFloat(priceMatch) || 0;
            }

            items.push({
              id: id,
              name: name,
              price: price,
              image: imageEl ? imageEl.src : null
            });
          } catch (error) {
            console.error('Ошибка при обработке товара в корзине:', error);
          }
        });

        // Если не нашли детализированные товары, но есть общая сумма - создаем один условный товар
        if (items.length === 0 && total_price > 0) {
          items.push({
            id: 'cart_total',
            name: 'Товары в корзине',
            price: total_price,
            image: null
          });
        }

        return { items, total_price };
      });

      if (cartData.items.length > 0 || cartData.total_price > 0) {
        logger.info(`Получено содержимое корзины через браузер: ${cartData.items.length} предметов, общая сумма: ${cartData.total_price}`);
        return {
          success: true,
          items: cartData.items,
          total_price: cartData.total_price,
          source: 'browser'
        };
      }

      return { success: false, message: 'Корзина пуста или не найдена' };
    } catch (error) {
      logger.error('Ошибка при получении корзины через браузер:', error);
      return { success: false, message: error.message };
    }
  }

  // Метод для оплаты корзины (обновленный для работы через браузер)
  async payCart() {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на CS.Money для оплаты корзины');
      }
    }

    logger.info('Оплата корзины на CS.Money...');

    try {
      // Сначала получаем текущий баланс и содержимое корзины
      const cartResult = await this.getCart();
      if (!cartResult.success || !cartResult.items || cartResult.items.length === 0) {
        return {
          success: false,
          message: 'Корзина пуста или не удалось получить содержимое корзины'
        };
      }

      const balanceResult = await this.getBalance();
      if (!balanceResult.success) {
        return {
          success: false,
          message: 'Не удалось получить баланс'
        };
      }

      // Проверяем достаточность средств
      if (balanceResult.balance < cartResult.total_price) {
        logger.error(`Недостаточно средств для оплаты корзины. Баланс: ${balanceResult.balance}, Цена: ${cartResult.total_price}`);
        return {
          success: false,
          message: `Недостаточно средств. Баланс: ${balanceResult.balance}, Требуется: ${cartResult.total_price}`,
          error_type: 'insufficient_balance'
        };
      }

      // Попробуем оплатить через браузер (как пользователь)
      const browserPayResult = await this.payCartViaBrowser();
      if (browserPayResult.success) {
        return browserPayResult;
      }

      // Fallback на API
      const payUrl = '/2.0/market/cart/pay';
      const data = {
        _csrf: this.csrfToken
      };

      const response = await this.axiosInstance.post(payUrl, data);

      if (response.data && response.data.success) {
        logger.info(`Корзина успешно оплачена через API. Order ID: ${response.data.order_id || 'Нет ID заказа'}`);
        return {
          success: true,
          order_id: response.data.order_id,
          total_paid: cartResult.total_price,
          data: response.data
        };
      } else {
        logger.warn(`Ошибка оплаты корзины: ${response.data.message || JSON.stringify(response.data)}`);
        return {
          success: false,
          message: response.data.message || 'Неизвестная ошибка оплаты',
          error_type: response.data.error || 'unknown',
          data: response.data
        };
      }
    } catch (error) {
      logger.error('Ошибка при получении корзины:', error);
      throw error;
    }
  }

  // Метод для покупки конкретного предмета напрямую (новый API)
  async buyItemDirect(itemId) {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на CS.Money для покупки предмета');
      }
    }

    logger.info(`Прямая покупка предмета: Item ID ${itemId}`);

    try {
      // Используем новый API endpoint для покупки
      const buyUrl = `/1.0/market/cart/items/${itemId}`;

      const traceId = this.generateTraceId();
      const spanId = this.generateSpanId();

      const headers = {
        ...this.axiosInstance.defaults.headers,
        'Content-Type': 'application/json',
        'x-client-app': 'web',
        'sentry-trace': `${traceId}-${spanId}-1`,
        'traceparent': `00-${traceId}-${spanId}-01`,
        'baggage': `sentry-environment=production,sentry-release=2025-06-03-0636-production,sentry-public_key=da19e2c6e5d741efbda9d313341ab6d6,sentry-trace_id=${traceId},sentry-sampled=true,sentry-sample_rand=0.14949963212859751,sentry-sample_rate=0.2`
      };

      // Отправляем DELETE запрос для покупки (как в реальном API)
      const response = await this.axiosInstance.delete(buyUrl, { headers });

      if (response.status === 200) {
        logger.info(`Предмет успешно куплен напрямую: Item ID ${itemId}`);

        // Отправляем событие покупки
        await this.sendStatusCartEvent(itemId, 'purchased');

        return {
          success: true,
          item_id: itemId,
          order_id: `direct_${itemId}_${Date.now()}`,
          method: 'direct_api',
          data: response.data
        };
      } else {
        logger.warn(`Ошибка прямой покупки предмета: ${response.data?.message || JSON.stringify(response.data)}`);
        return {
          success: false,
          message: response.data?.message || 'Неизвестная ошибка прямой покупки',
          error_type: response.data?.error || 'unknown',
          data: response.data
        };
      }
    } catch (error) {
      logger.error(`Ошибка при прямой покупке предмета (ID: ${itemId}):`, error);
      throw error;
    }
  }

  // Метод для оплаты корзины через браузер
  async payCartViaBrowser() {
    try {
      if (!this.page) {
        return { success: false, message: 'Браузер не инициализирован' };
      }

      logger.info('Оплачиваем корзину через браузер...');

      // Переходим на страницу корзины или убеждаемся, что мы на правильной странице
      await this.page.goto('https://cs.money/ru/market/buy/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Ищем кнопку "Купить" в корзине
      const buyButtonSelector = '.csm_953298e7'; // Класс кнопки из предоставленного HTML

      try {
        await this.page.waitForSelector(buyButtonSelector, { timeout: 10000 });

        // Кликаем по кнопке "Купить"
        await this.page.click(buyButtonSelector);
        logger.info('Нажали кнопку "Купить" в корзине');

        // Ждем ответа сервера
        await this.page.waitForTimeout(5000);

        // Проверяем, была ли покупка успешной (например, корзина очистилась)
        const cartEmpty = await this.page.evaluate(() => {
          const cartItems = document.querySelectorAll('.csm_06d323e9[data-card-id]');
          return cartItems.length === 0;
        });

        if (cartEmpty) {
          logger.info('Корзина очистилась после покупки - оплата прошла успешно');

          // Генерируем order ID на основе времени (так как реальный может быть недоступен)
          const orderId = `browser_order_${Date.now()}`;

          return {
            success: true,
            order_id: orderId,
            method: 'browser_purchase',
            total_paid: 'unknown' // Сумма неизвестна, так как корзина очистилась
          };
        } else {
          return {
            success: false,
            message: 'Корзина не очистилась после попытки покупки'
          };
        }
      } catch (elementError) {
        logger.warn('Не удалось найти кнопку покупки в корзине:', elementError.message);
        return {
          success: false,
          message: 'Кнопка покупки не найдена в корзине'
        };
      }
    } catch (error) {
      logger.error('Ошибка при оплате корзины через браузер:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Метод для очистки корзины (обновленный)
  async clearCart() {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на CS.Money для очистки корзины');
      }
    }

    try {
      // Попробуем очистить через браузер
      const browserClearResult = await this.clearCartViaBrowser();
      if (browserClearResult.success) {
        return browserClearResult;
      }

      // Fallback на API
      const response = await this.axiosInstance.post('/2.0/market/cart/clear', {
        _csrf: this.csrfToken
      });

      if (response.data && response.data.success) {
        logger.info('Корзина успешно очищена через API');
        return { success: true };
      } else {
        logger.warn(`Ошибка очистки корзины: ${response.data.message || JSON.stringify(response.data)}`);
        return {
          success: false,
          message: response.data.message || 'Ошибка очистки корзины'
        };
      }
    } catch (error) {
      logger.error('Ошибка при очистке корзины:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Метод для очистки корзины через браузер
  async clearCartViaBrowser() {
    try {
      if (!this.page) {
        return { success: false, message: 'Браузер не инициализирован' };
      }

      logger.info('Очищаем корзину через браузер...');

      await this.page.goto('https://cs.money/ru/market/buy/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Ищем иконку закрытия корзины (X)
      const closeIconSelector = '.csm_60e9d6a4'; // SVG иконка закрытия из HTML

      try {
        await this.page.waitForSelector(closeIconSelector, { timeout: 5000 });
        await this.page.click(closeIconSelector);
        logger.info('Нажали кнопку закрытия корзины');

        // Ждем, пока корзина очистится
        await this.page.waitForTimeout(2000);

        // Проверяем, очистилась ли корзина
        const cartEmpty = await this.page.evaluate(() => {
          const cartItems = document.querySelectorAll('.csm_06d323e9[data-card-id]');
          return cartItems.length === 0;
        });

        if (cartEmpty) {
          logger.info('Корзина успешно очищена через браузер');
          return { success: true, method: 'browser_clear' };
        } else {
          return { success: false, message: 'Корзина не очистилась после клика' };
        }
      } catch (elementError) {
        logger.warn('Не удалось найти кнопку очистки корзины:', elementError.message);
        return { success: false, message: 'Кнопка очистки не найдена' };
      }
    } catch (error) {
      logger.error('Ошибка при очистке корзины через браузер:', error);
      return { success: false, message: error.message };
    }
  }

  // Метод для проверки статуса trade offer
  async checkTradeStatus(orderId) {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на CS.Money для проверки статуса');
      }
    }

    try {
      const response = await this.axiosInstance.get(`/2.0/market/order/${orderId}/status`);

      if (response.data) {
        const status = response.data.status;
        const tradeOffer = response.data.trade_offer;

        logger.info(`Статус заказа ${orderId}: ${status}`);

        return {
          success: true,
          status: status,
          trade_offer: tradeOffer,
          is_ready: status === 'trade_sent' || status === 'completed',
          data: response.data
        };
      } else {
        return {
          success: false,
          message: 'Неверный формат ответа статуса'
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

  // Метод для проверки статуса прямого trade offer пользователю
  async checkDirectTradeStatus(orderId) {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на CS.Money для проверки статуса');
      }
    }

    try {
      logger.info(`Проверка статуса прямого trade offer для заказа ${orderId}`);

      const response = await this.axiosInstance.get(`/2.0/market/order/${orderId}/status`);

      if (response.data) {
        const status = response.data.status;
        const tradeOffer = response.data.trade_offer;

        logger.info(`Статус прямого trade offer ${orderId}: ${status}`);

        // Возможные статусы для прямых trade offers:
        // 'pending' - заказ создан, ожидается обработка
        // 'trade_sent' - trade offer отправлен пользователю
        // 'trade_accepted' - пользователь принял trade offer
        // 'completed' - транзакция завершена
        // 'declined' - пользователь отклонил trade offer
        // 'expired' - trade offer истек
        // 'cancelled' - заказ отменен

        const isTradeOfferSent = status === 'trade_sent' || status === 'trade_accepted' || status === 'completed';
        const isCompleted = status === 'completed' || status === 'trade_accepted';
        const isFailed = status === 'declined' || status === 'expired' || status === 'cancelled';

        return {
          success: true,
          status: status,
          trade_offer: tradeOffer,
          is_trade_offer_sent: isTradeOfferSent,
          is_completed: isCompleted,
          is_failed: isFailed,
          user_needs_action: status === 'trade_sent', // пользователь должен принять trade offer
          data: response.data
        };
      } else {
        return {
          success: false,
          message: 'Неверный формат ответа статуса'
        };
      }
    } catch (error) {
      logger.error(`Ошибка при проверке статуса прямого trade offer ${orderId}:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Метод для валидации trade URL
  async validateTradeURL(tradeUrl) {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на CS.Money для валидации trade URL');
      }
    }

    try {
      logger.info(`Валидация trade URL: ${tradeUrl}`);

      const encodedTradeUrl = encodeURIComponent(tradeUrl);
      const response = await this.axiosInstance.get(`/1.0/tradelink-validity?tradeLink=${encodedTradeUrl}`);

      if (response.data && response.data.valid) {
        logger.info('Trade URL валиден');
        return {
          success: true,
          valid: true,
          data: response.data
        };
      } else {
        logger.warn(`Trade URL невалиден: ${response.data?.message || 'неизвестная ошибка'}`);
        return {
          success: false,
          valid: false,
          message: response.data?.message || 'Trade URL невалиден'
        };
      }
    } catch (error) {
      logger.error(`Ошибка при валидации trade URL:`, error);
      return {
        success: false,
        valid: false,
        message: error.message
      };
    }
  }

  // Метод для получения информации о пользователе
  async getUserInfo() {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на CS.Money для получения user info');
      }
    }

    try {
      logger.info('Получение информации о пользователе');
      const response = await this.axiosInstance.get('/2.0/user_info');

      if (response.data) {
        logger.info('Информация о пользователе получена');
        return {
          success: true,
          data: response.data
        };
      } else {
        return {
          success: false,
          message: 'Неверный формат ответа user_info'
        };
      }
    } catch (error) {
      logger.error('Ошибка при получении информации о пользователе:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Метод для обновления trade URL в настройках CS.Money (через браузер)
  async updateTradeURL(tradeUrl) {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на CS.Money для изменения trade URL');
      }
    }

    try {
      logger.info(`Обновление trade URL на CS.Money: ${tradeUrl}`);

      // Шаг 1: Валидация trade URL
      const validationResult = await this.validateTradeURL(tradeUrl);
      if (!validationResult.success || !validationResult.valid) {
        logger.error(`Trade URL не прошел валидацию: ${validationResult.message}`);
        return {
          success: false,
          message: `Trade URL невалиден: ${validationResult.message}`,
          step: 'validation'
        };
      }

      // Шаг 2: Обновление через браузер (более надежный метод)
      const browserUpdateResult = await this.updateTradeURLViaBrowser(tradeUrl);
      if (browserUpdateResult.success) {
        return browserUpdateResult;
      }

      // Шаг 3: Fallback на API
      logger.info('Браузерное обновление не удалось, пробуем API...');
      const updateData = {
        trade_link: tradeUrl
      };

      const response = await this.axiosInstance.post('/add_trade_link', updateData, {
        headers: {
          'Content-Type': 'application/json;charset=UTF-8'
        }
      });

      if (response.status === 200) {
        logger.info(`Trade URL успешно обновлен через API на CS.Money: ${tradeUrl}`);
        return {
          success: true,
          message: 'Trade URL успешно обновлен через API',
          previous_url: this.currentTradeUrl || null,
          new_url: tradeUrl,
          method: 'api'
        };
      } else {
        logger.error(`Ошибка обновления trade URL. Status: ${response.status}, Data: ${JSON.stringify(response.data)}`);
        return {
          success: false,
          message: `Ошибка сервера при обновлении trade URL: ${response.status}`,
          step: 'update'
        };
      }
    } catch (error) {
      logger.error(`Ошибка при обновлении trade URL:`, error);
      return {
        success: false,
        message: error.message,
        step: 'request_error'
      };
    }
  }

  // Метод для обновления trade URL через браузер
  async updateTradeURLViaBrowser(tradeUrl) {
    try {
      if (!this.page) {
        return { success: false, message: 'Браузер не инициализирован' };
      }

      logger.info('Обновляем trade URL через браузер...');

      // Переходим на страницу настроек
      await this.page.goto('https://cs.money/ru/personal-info/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Ждем загрузки поля ввода trade URL
      await this.page.waitForSelector('input[placeholder*="steamcommunity.com/tradeoffer"], input.styles_input__1Ld76', { timeout: 10000 });

      // Очищаем поле и вводим новый trade URL
      await this.page.evaluate((newTradeUrl) => {
        const input = document.querySelector('input[placeholder*="steamcommunity.com/tradeoffer"]') ||
                     document.querySelector('input.styles_input__1Ld76');
        if (input) {
          input.value = '';
          input.value = newTradeUrl;

          // Триггерим события change и input
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, tradeUrl);

      // Ищем и нажимаем кнопку сохранения
      const saveButtonSelectors = [
        'button[type="submit"]',
        'button:contains("Сохранить")',
        'button:contains("Save")',
        '.save-button',
        '.submit-button'
      ];

      let saveButtonFound = false;
      for (const selector of saveButtonSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 2000 });
          await this.page.click(selector);
          saveButtonFound = true;
          logger.info(`Нажата кнопка сохранения с селектором: ${selector}`);
          break;
        } catch (selectorError) {
          // Продолжаем поиск с другим селектором
        }
      }

      if (!saveButtonFound) {
        // Пробуем нажать Enter в поле ввода
        await this.page.keyboard.press('Enter');
        logger.info('Нажата клавиша Enter для сохранения');
      }

      // Ждем ответа сервера
      await this.page.waitForTimeout(3000);

      // Проверяем, что URL сохранился
      const savedUrl = await this.page.evaluate(() => {
        const input = document.querySelector('input[placeholder*="steamcommunity.com/tradeoffer"]') ||
                     document.querySelector('input.styles_input__1Ld76');
        return input ? input.value : null;
      });

      if (savedUrl === tradeUrl) {
        logger.info(`Trade URL успешно обновлен через браузер: ${tradeUrl}`);
        this.currentTradeUrl = tradeUrl;
        return {
          success: true,
          message: 'Trade URL успешно обновлен через браузер',
          previous_url: this.currentTradeUrl || null,
          new_url: tradeUrl,
          method: 'browser'
        };
      } else {
        return {
          success: false,
          message: 'Trade URL не сохранился или сохранился некорректно',
          expected: tradeUrl,
          actual: savedUrl
        };
      }
    } catch (error) {
      logger.error('Ошибка при обновлении trade URL через браузер:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Метод для получения текущего trade URL из настроек
  async getCurrentTradeURL() {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на CS.Money для получения trade URL');
      }
    }

    try {
      logger.info('Получение текущего trade URL из настроек CS.Money');

      // Переходим на страницу настроек
      await this.page.goto('https://cs.money/ru/personal-info/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // Ждем загрузки input поля
      await this.page.waitForSelector('input.styles_input__1Ld76', { timeout: 10000 });

      // Получаем текущее значение trade URL
      const currentTradeUrl = await this.page.evaluate(() => {
        const input = document.querySelector('input.styles_input__1Ld76');
        return input ? input.value : null;
      });

      if (currentTradeUrl) {
        logger.info(`Текущий trade URL: ${currentTradeUrl}`);
        this.currentTradeUrl = currentTradeUrl;
        return {
          success: true,
          trade_url: currentTradeUrl
        };
      } else {
        logger.warn('Trade URL не найден на странице настроек');
        return {
          success: false,
          message: 'Trade URL не найден на странице'
        };
      }
    } catch (error) {
      logger.error('Ошибка при получении текущего trade URL:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Комбинированный метод для покупки предмета с прямой отправкой пользователю
  async buyItemForDirectTrade(itemId, assetId, price, userTradeUrl) {
    logger.info(`Начинаем покупку предмета для прямой отправки пользователю: Item ID ${itemId}, Asset ID ${assetId}, Цена ${price}, User Trade URL: ${userTradeUrl}`);

    try {
      // Шаг 1: Сохраняем текущий trade URL (если нужно восстановить)
      const currentTradeResult = await this.getCurrentTradeURL();
      let originalTradeUrl = null;
      if (currentTradeResult.success) {
        originalTradeUrl = currentTradeResult.trade_url;
        logger.info(`Сохранен оригинальный trade URL: ${originalTradeUrl}`);
      }

      // Шаг 2: Устанавливаем trade URL пользователя
      const updateResult = await this.updateTradeURL(userTradeUrl);
      if (!updateResult.success) {
        return {
          success: false,
          message: `Не удалось установить trade URL пользователя: ${updateResult.message}`,
          step: 'update_trade_url'
        };
      }

      // Шаг 3: Пробуем прямую покупку сначала (новый API)
      let purchaseResult;
      try {
        purchaseResult = await this.buyItemDirect(itemId);
        if (purchaseResult.success) {
          logger.info(`Предмет успешно куплен через прямой API: ${purchaseResult.order_id}`);
          return {
            success: true,
            order_id: purchaseResult.order_id,
            item_id: itemId,
            user_trade_url: userTradeUrl,
            original_trade_url: originalTradeUrl,
            method: 'direct_api',
            step: 'completed'
          };
        }
      } catch (directError) {
        logger.warn(`Прямая покупка не удалась, пробуем через корзину: ${directError.message}`);
      }

      // Шаг 4: Fallback - покупаем предмет через корзину
      purchaseResult = await this.buyItemViaCart(itemId, assetId, price);
      if (!purchaseResult.success) {
        // В случае ошибки покупки, пытаемся восстановить оригинальный trade URL
        if (originalTradeUrl && originalTradeUrl !== userTradeUrl) {
          logger.info('Покупка не удалась, восстанавливаем оригинальный trade URL');
          await this.updateTradeURL(originalTradeUrl);
        }

        return {
          success: false,
          message: `Не удалось купить предмет: ${purchaseResult.message}`,
          step: 'purchase',
          error_type: purchaseResult.error_type
        };
      }

      logger.info(`Предмет успешно куплен для прямой отправки пользователю. Order ID: ${purchaseResult.order_id}`);

      return {
        success: true,
        order_id: purchaseResult.order_id,
        total_paid: purchaseResult.total_paid,
        cart_id: purchaseResult.cart_id,
        user_trade_url: userTradeUrl,
        original_trade_url: originalTradeUrl,
        method: 'cart_api',
        step: 'completed'
      };

    } catch (error) {
      logger.error(`Ошибка при покупке предмета для прямой отправки (ID: ${itemId}):`, error);
      throw error;
    }
  }

  // Комбинированный метод для покупки через корзину
  async buyItemViaCart(itemId, assetId, price) {
    logger.info(`Начинаем покупку предмета через корзину: Item ID ${itemId}, Asset ID ${assetId}, Цена ${price}`);

    try {
      // Шаг 1: Очищаем корзину на всякий случай
      await this.clearCart();

      // Шаг 2: Добавляем предмет в корзину
      const addResult = await this.addToCart(itemId, assetId);
      if (!addResult.success) {
        return {
          success: false,
          message: `Не удалось добавить предмет в корзину: ${addResult.message}`,
          step: 'add_to_cart'
        };
      }

      // Шаг 3: Оплачиваем корзину
      const payResult = await this.payCart();
      if (!payResult.success) {
        // Очищаем корзину в случае ошибки
        await this.clearCart();
        return {
          success: false,
          message: `Не удалось оплатить корзину: ${payResult.message}`,
          error_type: payResult.error_type,
          step: 'pay_cart'
        };
      }

      logger.info(`Предмет успешно куплен через корзину. Order ID: ${payResult.order_id}`);

      return {
        success: true,
        order_id: payResult.order_id,
        total_paid: payResult.total_paid,
        cart_id: addResult.cart_id,
        step: 'completed'
      };

    } catch (error) {
      logger.error(`Ошибка при покупке предмета через корзину (ID: ${itemId}):`, error);
      // Пытаемся очистить корзину в случае любой ошибки
      try {
        await this.clearCart();
      } catch (clearError) {
        logger.warn('Не удалось очистить корзину после ошибки:', clearError);
      }
      throw error;
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

  // Метод для проверки уведомлений
  async checkNotifications(updatedFrom = null) {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на CS.Money для проверки уведомлений');
      }
    }

    try {
      const timestamp = updatedFrom || Date.now() - 24 * 60 * 60 * 1000; // последние 24 часа
      const url = `/1.0/market/notifications?updatedFrom=${timestamp}&limit=15`;

      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        logger.info(`Получено ${response.data?.notifications?.length || 0} уведомлений`);
        return {
          success: true,
          notifications: response.data?.notifications || [],
          data: response.data
        };
      } else {
        return {
          success: false,
          message: 'Ошибка получения уведомлений'
        };
      }
    } catch (error) {
      logger.error('Ошибка при проверке уведомлений:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Метод для проверки активных предложений
  async checkActiveOffers(updatedFrom = null) {
    if (!this.isLoggedIn) {
      await this.initialize();
      if (!this.isLoggedIn) {
        throw new Error('Необходимо авторизоваться на CS.Money для проверки активных предложений');
      }
    }

    try {
      const timestamp = updatedFrom || Date.now() - 24 * 60 * 60 * 1000; // последние 24 часа
      const url = `/1.0/market/active-offers?updatedFrom=${timestamp}`;

      const response = await this.axiosInstance.get(url);

      if (response.status === 200) {
        logger.info(`Получено ${response.data?.offers?.length || 0} активных предложений`);
        return {
          success: true,
          offers: response.data?.offers || [],
          data: response.data
        };
      } else {
        return {
          success: false,
          message: 'Ошибка получения активных предложений'
        };
      }
    } catch (error) {
      logger.error('Ошибка при проверке активных предложений:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Вспомогательные методы для генерации trace ID (как в реальных запросах)
  generateTraceId() {
    // Генерируем 32-символьный hex ID
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  generateSpanId() {
    // Генерируем 16-символьный hex ID
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  }

  // Метод для обновления cookies из браузера
  async updateCookiesFromBrowser() {
    try {
      if (!this.page) {
        logger.warn('Браузер не инициализирован для обновления cookies');
        return { success: false, message: 'Браузер не инициализирован' };
      }

      logger.info('Обновляем cookies из текущей сессии браузера...');

      // Получаем все cookies из браузера
      const browserCookies = await this.page.cookies();

      if (browserCookies.length === 0) {
        logger.warn('Не найдено cookies в браузере');
        return { success: false, message: 'Cookies не найдены' };
      }

      // Преобразуем cookies в строку формата "name=value; name2=value2"
      const cookieString = browserCookies
        .filter(cookie => cookie.domain.includes('cs.money'))
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ');

      if (cookieString) {
        // Обновляем cookies в конфигурации
        this.cookies = cookieString;
        this.config.cookies = cookieString;

        // Обновляем заголовки axios
        this.axiosInstance.defaults.headers.Cookie = cookieString;

        // Сохраняем обновленную конфигурацию
        CSMoneyService.saveConfig(this.config);

        logger.info(`Cookies успешно обновлены. Найдено ${browserCookies.length} cookies`);
        return {
          success: true,
          cookiesCount: browserCookies.length,
          cookieString: cookieString.substring(0, 100) + '...' // Показываем первые 100 символов
        };
      }

      return { success: false, message: 'Не найдено cookies для cs.money' };
    } catch (error) {
      logger.error('Ошибка при обновлении cookies:', error);
      return { success: false, message: error.message };
    }
  }

  // Метод для проверки и восстановления соединения
  async ensureConnection() {
    try {
      // Проверяем текущий статус авторизации
      if (!this.isLoggedIn) {
        logger.info('Не авторизован, пытаемся восстановить соединение...');
        await this.checkLogin();
      }

      // Если все еще не авторизован, пробуем обновить cookies
      if (!this.isLoggedIn) {
        logger.info('Пробуем обновить cookies...');
        const updateResult = await this.updateCookiesFromBrowser();

        if (updateResult.success) {
          // Повторная проверка авторизации с новыми cookies
          await this.checkLogin();
        }
      }

      return this.isLoggedIn;
    } catch (error) {
      logger.error('Ошибка при восстановлении соединения:', error);
      return false;
    }
  }
}

module.exports = CSMoneyService;