const axios = require('axios');
const winston = require('winston');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const { csmoneyQueue } = require('./csmoneyWorker');
const { chromium } = require('playwright');
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
    // Убрана инициализация Puppeteer из основного сервиса
    logger.info('Инициализация браузера перенесена в worker');
  }

  async checkLogin() {
    if (!this.cookies || this.cookies.trim() === '') {
      logger.error('Отсутствуют cookies для авторизации в CS.Money.');
      this.isLoggedIn = false;
      return false;
    }

    logger.info('Переход на страницу CS.Money для проверки авторизации...');

    try {
      // Запуск браузера Playwright
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.page = await this.browser.newPage();

      // Сначала переходим на главную страницу, чтобы инициализировать cookies правильно
      await this.page.goto('https://cs.money/', {
        waitUntil: 'networkidle',
        timeout: 60000
      });

      // Добавляем задержку для правильной обработки страницы
      await this.page.waitForTimeout(5000);

      // Затем переходим на страницу маркета
      await this.page.goto('https://cs.money/ru/market/buy/', {
        waitUntil: 'networkidle',
        timeout: 60000
      });

      // Добавляем ещё одну задержку перед проверкой авторизации
      await this.page.waitForTimeout(5000);

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

      const apiUrl = `https://cs.money/2.0/market/sell-orders?limit=60&offset=${offset}`;

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
          await this.page.waitForTimeout(scrollDelay);

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
