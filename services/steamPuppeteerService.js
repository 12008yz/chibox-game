const puppeteer = require('puppeteer');
const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Логгер
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'steam-puppeteer.log' })
  ],
});

class SteamPuppeteerService {
  constructor(steamConfig) {
    this.steamConfig = steamConfig;
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.sessionPath = path.join(__dirname, '../sessions/steam_session.json');

    // Настройки
    this.config = {
      headless: true, // Включаем headless режим для контейнера
      slowMo: 100, // Замедляем действия
      timeout: 30000,
      viewport: { width: 1920, height: 1080 }
    };
  }

  /**
   * Инициализация браузера
   */
  async initialize() {
    try {
      logger.info('🚀 Запуск Puppeteer браузера...');

      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        slowMo: this.config.slowMo,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-background-networking',
          '--disable-ipc-flooding-protection',
          '--single-process',
          '--window-size=1920,1080'
        ],
        executablePath: process.env.CHROME_BIN || undefined
      });

      this.page = await this.browser.newPage();

      // Настройка viewport
      await this.page.setViewport(this.config.viewport);

      // Настройка User-Agent
      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // Настройка таймаутов
      this.page.setDefaultTimeout(this.config.timeout);
      this.page.setDefaultNavigationTimeout(this.config.timeout);

      logger.info('✅ Puppeteer браузер запущен');
      return true;

    } catch (error) {
      logger.error(`Ошибка инициализации Puppeteer: ${error.message}`);
      throw error;
    }
  }

  /**
   * Авторизация в Steam
   */
  async login() {
    try {
      if (this.isLoggedIn) {
        logger.info('✅ Уже авторизованы в Steam');
        return true;
      }

      logger.info('🔐 Начинаем авторизацию в Steam...');

      // Пробуем загрузить сохраненную сессию
      if (await this.loadSession()) {
        logger.info('✅ Сессия загружена из файла');
        return true;
      }

      // Пробуем несколько вариантов страниц входа
      const loginUrls = [
        'https://steamcommunity.com/login',
        'https://steamcommunity.com/login/home/',
        'https://store.steampowered.com/login/'
      ];

      let loginSuccess = false;

      for (const loginUrl of loginUrls) {
        try {
          logger.info(`🌐 Пробуем войти через: ${loginUrl}`);

          await this.page.goto(loginUrl, {
            waitUntil: 'networkidle2',
            timeout: 15000
          });

          await this.delay(2000);

          // Проверяем различные селекторы для поля логина
          const usernameSelectors = [
            'input[name="username"]',
            'input[id="input_username"]',
            'input[class*="username"]',
            'input[placeholder*="логин"]',
            'input[placeholder*="Login"]',
            'input[placeholder*="Имя"]',
            'input[type="text"]:first-of-type'
          ];

          let usernameField = null;
          let usedSelector = null;

          for (const selector of usernameSelectors) {
            try {
              await this.page.waitForSelector(selector, { timeout: 3000 });
              usernameField = await this.page.$(selector);
              if (usernameField) {
                usedSelector = selector;
                logger.info(`✅ Найдено поле логина: ${selector}`);
                break;
              }
            } catch (e) {
              // Продолжаем поиск
            }
          }

          if (!usernameField) {
            logger.warn(`❌ Не найдено поле логина на ${loginUrl}`);
            continue;
          }

          // Очищаем поле и вводим логин
          await this.page.focus(usedSelector);
          await this.page.keyboard.down('Control');
          await this.page.keyboard.press('a');
          await this.page.keyboard.up('Control');
          await this.page.type(usedSelector, this.steamConfig.accountName, { delay: 100 });
          await this.delay(1000);

          // Ищем поле пароля
          const passwordSelectors = [
            'input[name="password"]',
            'input[id="input_password"]',
            'input[type="password"]',
            'input[class*="password"]'
          ];

          let passwordField = null;
          let passwordSelector = null;

          for (const selector of passwordSelectors) {
            try {
              passwordField = await this.page.$(selector);
              if (passwordField) {
                passwordSelector = selector;
                logger.info(`✅ Найдено поле пароля: ${selector}`);
                break;
              }
            } catch (e) {
              // Продолжаем поиск
            }
          }

          if (!passwordField) {
            logger.warn(`❌ Не найдено поле пароля на ${loginUrl}`);
            continue;
          }

          // Вводим пароль
          await this.page.focus(passwordSelector);
          await this.page.keyboard.down('Control');
          await this.page.keyboard.press('a');
          await this.page.keyboard.up('Control');
          await this.page.type(passwordSelector, this.steamConfig.password, { delay: 100 });
          await this.delay(1000);

          // Ищем кнопку входа
          const submitSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button[class*="submit"]',
            'button[class*="login"]',
            '.login_btn',
            '.btn_signin',
            '.btn_medium'
          ];

          let submitButton = null;

          for (const selector of submitSelectors) {
            try {
              submitButton = await this.page.$(selector);
              if (submitButton) {
                const isVisible = await submitButton.isIntersectingViewport();
                if (isVisible) {
                  logger.info(`✅ Найдена кнопка входа: ${selector}`);
                  break;
                }
              }
            } catch (e) {
              // Продолжаем поиск
            }
          }

          if (!submitButton) {
            // Пробуем нажать Enter
            logger.info('🔍 Пробуем нажать Enter для входа');
            await this.page.keyboard.press('Enter');
          } else {
            // Нажимаем кнопку входа
            await submitButton.click();
          }

          // Ждем реакции
          await this.delay(3000);

          // Проверяем, нужен ли 2FA код
          const authCodeSelectors = [
            'input[name="twofactorcode"]',
            'input[id="twofactorcode_entry"]',
            'input[placeholder*="код"]',
            'input[placeholder*="code"]'
          ];

          let needsMobileAuth = false;
          let authCodeField = null;

          for (const selector of authCodeSelectors) {
            try {
              authCodeField = await this.page.$(selector);
              if (authCodeField) {
                needsMobileAuth = true;
                logger.info(`📱 Требуется код 2FA, найдено поле: ${selector}`);
                break;
              }
            } catch (e) {
              // Продолжаем поиск
            }
          }

          if (needsMobileAuth && authCodeField) {
            logger.info('📱 Генерируем код 2FA...');

            // Генерируем код 2FA
            const SteamTotp = require('steam-totp');
            const authCode = SteamTotp.generateAuthCode(this.steamConfig.sharedSecret);

            logger.info(`🔢 Вводим 2FA код: ${authCode}`);

            // Очищаем поле и вводим код
            await authCodeField.focus();
            await authCodeField.click({ clickCount: 3 });
            await this.page.type('input[name="twofactorcode"], input[id="twofactorcode_entry"]', authCode, { delay: 100 });
            await this.delay(1000);

            // Ищем кнопку подтверждения 2FA
            const confirmSelectors = [
              'button[type="submit"]',
              'input[type="submit"]',
              '.auth_button',
              '.btn_signin'
            ];

            let confirmButton = null;

            for (const selector of confirmSelectors) {
              try {
                confirmButton = await this.page.$(selector);
                if (confirmButton) {
                  const isVisible = await confirmButton.isIntersectingViewport();
                  if (isVisible) {
                    break;
                  }
                }
              } catch (e) {
                // Продолжаем поиск
              }
            }

            if (confirmButton) {
              await confirmButton.click();
            } else {
              await this.page.keyboard.press('Enter');
            }
          }

          // Ждем успешной авторизации или ошибки
          await this.delay(5000);

          // Проверяем, авторизовались ли мы
          const isLoggedIn = await this.checkLoginStatus();

          if (isLoggedIn) {
            this.isLoggedIn = true;
            loginSuccess = true;

            // Сохраняем сессию
            await this.saveSession();

            logger.info('✅ Успешная авторизация в Steam');
            break;
          } else {
            logger.warn(`❌ Авторизация неудачна через ${loginUrl}`);
          }

        } catch (error) {
          logger.warn(`Ошибка на ${loginUrl}: ${error.message}`);
          continue;
        }
      }

      if (!loginSuccess) {
        throw new Error('Не удалось авторизоваться ни через одну из страниц входа');
      }

      return true;

    } catch (error) {
      logger.error(`Ошибка авторизации: ${error.message}`);
      throw error;
    }
  }

  /**
   * Поиск и покупка предмета
   */
  async searchAndBuyItem(itemName, maxPrice = null) {
    try {
      logger.info(`🔍 Поиск предмета: ${itemName}`);

      if (!this.isLoggedIn) {
        await this.login();
      }

      // Переходим на Steam Market
      const marketUrl = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(itemName)}`;
      logger.info(`🌐 Переход на: ${marketUrl}`);

      await this.page.goto(marketUrl, { waitUntil: 'networkidle2' });

      // Ждем загрузки предложений
      await this.delay(3000);

      // Ищем таблицу с предложениями
      const listings = await this.page.$$('#searchResultsRows .market_listing_row');

      if (listings.length === 0) {
        return { success: false, message: 'Предложения не найдены' };
      }

      logger.info(`📋 Найдено ${listings.length} предложений`);

      // Анализируем первые предложения
      const offers = [];

      for (let i = 0; i < Math.min(listings.length, 5); i++) {
        try {
          const listing = listings[i];

          // Получаем цену
          const priceElement = await listing.$('.market_listing_price');
          if (!priceElement) continue;

          const priceText = await priceElement.evaluate(el => el.textContent.trim());
          const price = this.parsePrice(priceText);

          if (price > 0 && (!maxPrice || price <= maxPrice)) {
            // Получаем кнопку покупки
            const buyButton = await listing.$('.item_market_action_button');

            if (buyButton) {
              const buttonText = await buyButton.evaluate(el => el.textContent.trim());

              if (buttonText.includes('Купить')) {
                offers.push({
                  index: i,
                  price: price,
                  priceText: priceText,
                  element: listing,
                  buyButton: buyButton
                });

                logger.info(`💰 Предложение ${i + 1}: ${priceText} (${price} руб.)`);
              }
            }
          }
        } catch (err) {
          logger.warn(`Ошибка анализа предложения ${i}: ${err.message}`);
        }
      }

      if (offers.length === 0) {
        return { success: false, message: 'Нет подходящих предложений для покупки' };
      }

      // Сортируем по цене и берем самое дешевое
      offers.sort((a, b) => a.price - b.price);
      const cheapestOffer = offers[0];

      logger.info(`🎯 Выбрано самое дешевое: ${cheapestOffer.priceText}`);

      // Покупаем предмет
      const purchaseResult = await this.buyItem(cheapestOffer);

      if (purchaseResult.success) {
        return {
          success: true,
          item: {
            name: itemName,
            price: cheapestOffer.price,
            priceText: cheapestOffer.priceText,
            purchaseTime: new Date().toISOString()
          }
        };
      } else {
        return {
          success: false,
          message: `Ошибка покупки: ${purchaseResult.message}`
        };
      }

    } catch (error) {
      logger.error(`Ошибка поиска/покупки: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Покупка конкретного предложения
   */
  async buyItem(offer) {
    try {
      logger.info(`💳 Покупаем предмет за ${offer.priceText}...`);

      // Нажимаем кнопку покупки
      await offer.buyButton.click();

      // Ждем появления диалога подтверждения
      await this.delay(2000);

      // Ищем диалог покупки
      const dialogSelector = '.newmodal, .modal_frame, #BuyMarketListingDialog';
      await this.page.waitForSelector(dialogSelector, { timeout: 10000 });

      // Ищем кнопку подтверждения покупки
      const confirmButton = await this.page.$('#market_buynow_dialog_purchase');

      if (!confirmButton) {
        // Альтернативные селекторы для кнопки
        const altSelectors = [
          'input[value="Купить сейчас"]',
          'button:contains("Купить")',
          '.btn_green_steamui'
        ];

        for (const selector of altSelectors) {
          const btn = await this.page.$(selector);
          if (btn) {
            confirmButton = btn;
            break;
          }
        }
      }

      if (!confirmButton) {
        throw new Error('Кнопка подтверждения покупки не найдена');
      }

      logger.info('✅ Подтверждаем покупку...');

      // Подтверждаем покупку
      await confirmButton.click();

      // Ждем результата покупки
      await this.delay(5000);

      // Проверяем результат
      const successMessage = await this.page.$('.market_dialog_success, .newmodal_content:contains("успешно")');
      const errorMessage = await this.page.$('.market_dialog_error, .newmodal_content:contains("ошибка")');

      if (successMessage) {
        logger.info('✅ Предмет успешно куплен!');
        return { success: true };
      } else if (errorMessage) {
        const errorText = await errorMessage.evaluate(el => el.textContent);
        logger.error(`❌ Ошибка покупки: ${errorText}`);
        return { success: false, message: errorText };
      } else {
        // Проверяем, не появилась ли ошибка недостатка средств
        const insufficientFunds = await this.page.evaluate(() => {
          const errorElements = document.querySelectorAll('.market_dialog_error, .newmodal_content');
          return Array.from(errorElements).some(el => el.textContent.includes('недостаточно средств'));
        });

        if (insufficientFunds) {
          return { success: false, message: 'Недостаточно средств в Steam кошельке' };
        }

        logger.warn('⚠️ Неопределенный результат покупки');
        return { success: false, message: 'Неопределенный результат покупки' };
      }

    } catch (error) {
      logger.error(`Ошибка покупки: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Отправка trade offer
   */
  async sendTradeOffer(tradeUrl, itemAssetIds = []) {
    try {
      logger.info(`📤 Отправка trade offer: ${tradeUrl}`);

      if (!this.isLoggedIn) {
        await this.login();
      }

      // Переходим к инвентарю
      await this.page.goto('https://steamcommunity.com/my/inventory/', {
        waitUntil: 'networkidle2'
      });

      await this.delay(3000);

      // Если указаны конкретные предметы, выбираем их
      if (itemAssetIds.length > 0) {
        for (const assetId of itemAssetIds) {
          const itemSelector = `[data-id="${assetId}"]`;
          const item = await this.page.$(itemSelector);

          if (item) {
            await item.click();
            await this.delay(500);
            logger.info(`✅ Выбран предмет: ${assetId}`);
          } else {
            logger.warn(`⚠️ Предмет не найден: ${assetId}`);
          }
        }
      } else {
        // Выбираем первые доступные предметы
        const items = await this.page.$$('.item.app730.context2');

        if (items.length > 0) {
          // Выбираем первый предмет
          await items[0].click();
          await this.delay(500);
          logger.info('✅ Выбран первый доступный предмет');
        } else {
          return { success: false, message: 'Нет предметов для отправки' };
        }
      }

      // Переходим по trade URL
      await this.page.goto(tradeUrl, { waitUntil: 'networkidle2' });
      await this.delay(3000);

      // Ждем загрузки страницы trade offer
      await this.page.waitForSelector('#trade_offer_create_dialog, .trade_area', { timeout: 15000 });

      // Проверяем, можем ли отправить trade
      const readyToTrade = await this.page.$('.trade_offer_create_button');

      if (!readyToTrade) {
        return { success: false, message: 'Кнопка создания trade offer не найдена' };
      }

      // Отправляем trade offer
      await readyToTrade.click();
      await this.delay(2000);

      // Подтверждаем отправку
      const confirmButton = await this.page.$('.trade_offer_create_button:not([disabled])');

      if (confirmButton) {
        await confirmButton.click();
        await this.delay(3000);

        // Проверяем успешность
        const successUrl = this.page.url();

        if (successUrl.includes('tradeoffer')) {
          const tradeOfferId = successUrl.match(/tradeoffer\/(\d+)/);

          logger.info('✅ Trade offer отправлен успешно');

          return {
            success: true,
            tradeOfferId: tradeOfferId ? tradeOfferId[1] : null,
            url: successUrl
          };
        }
      }

      return { success: false, message: 'Не удалось подтвердить отправку trade offer' };

    } catch (error) {
      logger.error(`Ошибка отправки trade offer: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Проверка баланса Steam кошелька
   */
  async checkWalletBalance() {
    try {
      logger.info('💰 Проверка баланса Steam кошелька...');

      if (!this.isLoggedIn) {
        await this.login();
      }

      // Переходим в аккаунт
      await this.page.goto('https://store.steampowered.com/account/', {
        waitUntil: 'networkidle2'
      });

      // Ищем информацию о балансе
      const balanceElement = await this.page.$('.accountData .price, .wallet_balance .price');

      if (balanceElement) {
        const balanceText = await balanceElement.evaluate(el => el.textContent.trim());
        const balance = this.parsePrice(balanceText);

        logger.info(`💳 Баланс кошелька: ${balanceText} (${balance} руб.)`);

        return {
          success: true,
          balance: balance,
          balanceText: balanceText
        };
      } else {
        return { success: false, message: 'Не удалось найти информацию о балансе' };
      }

    } catch (error) {
      logger.error(`Ошибка проверки баланса: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Проверка статуса авторизации
   */
  async checkLoginStatus() {
    try {
      const currentUrl = this.page.url();

      // Проверяем URL и элементы страницы
      if (currentUrl.includes('steamcommunity.com') && !currentUrl.includes('login')) {
        // Ищем элементы, которые есть только у авторизованных пользователей
        const authSelectors = [
          '.playerAvatar',
          '.account_pulldown',
          '.profile_small_header_avatar',
          '.user_avatar',
          '.global_header .playerAvatar',
          '.account_dropdown',
          '#account_pulldown'
        ];

        for (const selector of authSelectors) {
          try {
            const element = await this.page.$(selector);
            if (element) {
              logger.info(`✅ Найден элемент авторизованного пользователя: ${selector}`);
              return true;
            }
          } catch (e) {
            // Продолжаем поиск
          }
        }
      }

      // Дополнительная проверка - ищем кнопку входа
      const loginSelectors = [
        'a[href*="login"]',
        '.login_btn',
        '.btn_signin'
      ];

      for (const selector of loginSelectors) {
        try {
          const loginElement = await this.page.$(selector);
          if (loginElement) {
            logger.info(`❌ Найдена кнопка входа: ${selector}, пользователь не авторизован`);
            return false;
          }
        } catch (e) {
          // Игнорируем ошибки
        }
      }

      // Если URL содержит профильную информацию, считаем пользователя авторизованным
      if (currentUrl.includes('/my/') || currentUrl.includes('/profiles/')) {
        logger.info('✅ URL указывает на авторизованного пользователя');
        return true;
      }

      return false;
    } catch (error) {
      logger.warn(`Ошибка проверки статуса авторизации: ${error.message}`);
      return false;
    }
  }

  /**
   * Сохранение сессии
   */
  async saveSession() {
    try {
      const sessionDir = path.dirname(this.sessionPath);
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }

      const cookies = await this.page.cookies();
      const sessionData = {
        cookies: cookies,
        timestamp: Date.now(),
        url: this.page.url()
      };

      fs.writeFileSync(this.sessionPath, JSON.stringify(sessionData, null, 2));
      logger.info('💾 Сессия сохранена');
    } catch (error) {
      logger.warn(`Не удалось сохранить сессию: ${error.message}`);
    }
  }

  /**
   * Загрузка сохраненной сессии
   */
  async loadSession() {
    try {
      if (!fs.existsSync(this.sessionPath)) {
        return false;
      }

      const sessionData = JSON.parse(fs.readFileSync(this.sessionPath, 'utf8'));

      // Проверяем, не устарела ли сессия (24 часа)
      const sessionAge = Date.now() - sessionData.timestamp;
      if (sessionAge > 24 * 60 * 60 * 1000) {
        logger.info('🕐 Сессия устарела, требуется новая авторизация');
        return false;
      }

      // Загружаем cookies
      await this.page.setCookie(...sessionData.cookies);

      // Переходим на Steam Community для проверки
      await this.page.goto('https://steamcommunity.com/', { waitUntil: 'networkidle2' });

      // Проверяем, авторизованы ли мы
      const isLoggedIn = await this.checkLoginStatus();

      if (isLoggedIn) {
        this.isLoggedIn = true;
        logger.info('✅ Сессия успешно восстановлена');
        return true;
      } else {
        logger.info('❌ Сессия недействительна');
        return false;
      }

    } catch (error) {
      logger.warn(`Ошибка загрузки сессии: ${error.message}`);
      return false;
    }
  }

  /**
   * Парсинг цены из текста
   */
  parsePrice(priceText) {
    if (!priceText) return 0;

    // Убираем все кроме цифр, запятых и точек
    const cleanText = priceText.replace(/[^\d,.-]/g, '');

    // Ищем числа
    const matches = cleanText.match(/(\d+(?:[,.]?\d+)?)/);

    if (matches) {
      // Заменяем запятую на точку и парсим
      const price = parseFloat(matches[1].replace(',', '.'));
      return isNaN(price) ? 0 : Math.round(price);
    }

    return 0;
  }

  /**
   * Задержка
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Скриншот для отладки
   */
  async takeScreenshot(name = 'debug') {
    try {
      const screenshotPath = path.join(__dirname, '../screenshots');
      if (!fs.existsSync(screenshotPath)) {
        fs.mkdirSync(screenshotPath, { recursive: true });
      }

      const filename = `${name}_${Date.now()}.png`;
      const filepath = path.join(screenshotPath, filename);

      await this.page.screenshot({ path: filepath, fullPage: true });
      logger.info(`📸 Скриншот сохранен: ${filename}`);

      return filepath;
    } catch (error) {
      logger.warn(`Ошибка скриншота: ${error.message}`);
      return null;
    }
  }

  /**
   * Завершение работы
   */
  async shutdown() {
    try {
      logger.info('🛑 Завершение работы Puppeteer...');

      if (this.page) {
        await this.page.close();
      }

      if (this.browser) {
        await this.browser.close();
      }

      logger.info('✅ Puppeteer остановлен');
    } catch (error) {
      logger.error(`Ошибка завершения Puppeteer: ${error.message}`);
    }
  }
}

module.exports = SteamPuppeteerService;
