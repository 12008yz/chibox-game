const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { translate: translateText } = require('@vitalets/google-translate-api');

puppeteer.use(StealthPlugin());

/** Задержка в мс (вместо устаревшего page.waitForTimeout) */
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

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
        headless: true, // На сервере нет дисплея — только headless
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process'
        ],
      });

      this.page = await this.browser.newPage();

      // Устанавливаем User-Agent
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
      );

      // Сначала переходим на домен (Puppeteer требует быть на домене перед setCookie)
      await this.page.goto('https://playerok.com', { waitUntil: 'domcontentloaded', timeout: 15000 });

      // Загружаем cookies
      if (fs.existsSync(this.cookiesPath)) {
        const cookies = JSON.parse(fs.readFileSync(this.cookiesPath, 'utf8'));
        await this.page.setCookie(...cookies);
        logger.info('✅ Cookies загружены');
        await this.page.reload({ waitUntil: 'networkidle2' });
      } else {
        logger.warn('⚠️ Файл с cookies не найден: config/playerok-cookies.json');
      }

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
        // Ищем ссылку на профиль в хедере
        const profileLink = document.querySelector('a[href*="/profile"]');
        const chatIcon = document.querySelector('a[href*="/chats"]');
        return profileLink !== null || chatIcon !== null;
      });

      return userMenuExists;
    } catch (error) {
      logger.error('❌ Ошибка проверки авторизации:', error);
      return false;
    }
  }

  /**
   * Проверка, есть ли в строке кириллица
   */
  _hasCyrillic(str) {
    return /[а-яёА-ЯЁ]/.test(str || '');
  }

  /**
   * Убирает скобки с износом из названия: "Galil AR | Acid Dart (Minimal Wear)" → "Galil AR | Acid Dart".
   * На PlayerOk часто ищут без (Немного поношенное) и т.п.
   */
  _stripWearCondition(name) {
    return (name || '').replace(/\s*\([^)]*\)\s*$/g, '').trim();
  }

  /**
   * Извлекает только название скина (часть после " | "): "Galil AR | Acid Dart" → "Acid Dart".
   */
  _skinNameOnly(name) {
    const s = (name || '').trim();
    const idx = s.indexOf(' | ');
    return idx >= 0 ? s.slice(idx + 3).trim() : s;
  }

  /**
   * На PlayerOk оружие часто в формате "АВТОМАТ «ГАЛИЛЬ»", а не "Галиль АР".
   * Маппинг: английское название оружия (до " | ") → как пишут на PlayerOk.
   */
  _playerokWeaponName(weaponEn) {
    const w = (weaponEn || '').trim().toLowerCase();
    const map = {
      'galil ar': 'АВТОМАТ «ГАЛИЛЬ»',
      'galil': 'АВТОМАТ «ГАЛИЛЬ»',
      'usp-s': 'USP-S',
      'desert eagle': 'DESERT EAGLE',
      'ak-47': 'АК-47',
      'm4a4': 'M4A4',
      'm4a1-s': 'M4A1-S',
      'awp': 'AWP',
    };
    return map[w] || null;
  }

  /**
   * Перевод текста на русский (для поиска на PlayerOk). При ошибке возвращает исходную строку.
   */
  async _translateToRussian(text) {
    if (!text || this._hasCyrillic(text)) return text;
    try {
      const res = await translateText(text, { to: 'ru' });
      return (res && res.text) ? res.text : text;
    } catch (err) {
      logger.warn('⚠️ Не удалось перевести запрос на русский:', err.message);
      return text;
    }
  }

  /**
   * Поиск предмета на PlayerOk (по русскому и английскому запросу)
   * @param {string} itemName - Название предмета (например "USP-S | Alpine Camo (Field-Tested)" или "Desert Eagle Оксидное пламя")
   * @param {number} maxPrice - Максимальная цена для покупки
   * @returns {Object} Первое найденное предложение или null
   */
  async searchItem(itemName, maxPrice = null) {
    try {
      logger.info(`🔍 Поиск предмета: "${itemName}" (макс. цена: ${maxPrice || 'не ограничена'}₽)`);

      // Переходим на страницу CS2 скинов
      await this.page.goto('https://playerok.com/games/counter-strike-2/skins', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      logger.info('✅ Открыта страница скинов CS2');

      // Даём SPA время отрендерить поиск (PlayerOk — React/MUI)
      await delay(5000);

      // Поле поиска: input[name="search"] или по placeholder
      const searchSelector = 'input[name="search"]';
      await this.page.waitForSelector(searchSelector, { timeout: 20000 }).catch(() => null);
      if (!(await this.page.$(searchSelector))) {
        await this.page.waitForSelector('input[placeholder*="Поиск"], input[placeholder*="поиск"]', { timeout: 10000 }).catch(() => null);
      }

      // Без скобок с износом — на PlayerOk часто ищут без "(Немного поношенное)"
      const nameNoWear = this._stripWearCondition(itemName);
      const skinOnly = this._skinNameOnly(nameNoWear);
      const weaponPart = nameNoWear.indexOf(' | ') >= 0 ? nameNoWear.slice(0, nameNoWear.indexOf(' | ')).trim() : '';

      const searchQueries = [];
      if (this._hasCyrillic(itemName)) {
        searchQueries.push(nameNoWear);
        if (skinOnly && skinOnly !== nameNoWear) searchQueries.push(skinOnly);
      } else {
        const ruFull = await this._translateToRussian(nameNoWear);
        const ruSkin = skinOnly && skinOnly !== nameNoWear ? await this._translateToRussian(skinOnly) : '';

        // На сайте подсказки в формате "АВТОМАТ «ГАЛИЛЬ» | КИСЛОТНЫЙ ДРОТИК" — добавляем этот вариант первым
        const playerokWeapon = weaponPart ? this._playerokWeaponName(weaponPart) : null;
        if (playerokWeapon && ruSkin) {
          searchQueries.push(`${playerokWeapon} | ${ruSkin.toUpperCase()}`);
        }

        if (ruFull && ruFull !== nameNoWear) searchQueries.push(ruFull);
        if (ruSkin && ruSkin !== skinOnly) searchQueries.push(ruSkin);
        if (skinOnly && skinOnly !== nameNoWear) searchQueries.push(skinOnly);
        searchQueries.push(nameNoWear);
      }
      const uniqueQueries = [...new Set(searchQueries)];

      const normalizeForMatch = (s) =>
        (s || '')
          .replace(/\s*\([^)]*\)\s*/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

      for (const query of uniqueQueries) {
        const langLabel = this._hasCyrillic(query) ? 'RU' : 'EN';
        logger.info(`🔎 Поиск [${langLabel}]: "${query}"`);

        const searchFilled = await this.page.evaluate((name) => {
          const el =
            document.querySelector('input[name="search"]') ||
            document.querySelector('input[placeholder*="Поиск"]') ||
            document.querySelector('input[placeholder*="поиск"]');
          if (!el) return false;
          el.scrollIntoView({ block: 'center' });
          el.focus();
          el.value = '';
          el.value = name;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }, query);

        if (!searchFilled) continue;
        await delay(800);

        // Запускаем поиск по Enter (на многих сайтах поиск срабатывает по Enter)
        await this.page.keyboard.press('Enter');
        await delay(3000);

        // Ждём появления результатов: текст "Найдено" или ссылки на товары
        await this.page.waitForFunction(
          () => document.body.innerText.includes('Найдено') || document.querySelector('a[href*="/products/"]'),
          { timeout: 25000 }
        ).catch(() => null);
        await delay(2500);

        const searchNormalized = normalizeForMatch(query);
        const searchWords = searchNormalized.split(/\s+/).filter((w) => w.length > 1);

        const firstOffer = await this.page.evaluate(({ maxPrice, words }) => {
          const cards = document.querySelectorAll('a[href*="/products/"], a[href*="/product/"]');

          for (const card of cards) {
            try {
              const url = card.href;
              if (!url) continue;
              // Название и цена могут быть в родительском блоке карточки, не в самой ссылке
              const container = card.closest('div[class*="card"], div[class*="Card"], div[class*="product"], article, section') || card.parentElement || card;
              const name = (container ? container.textContent : card.textContent).trim();
              if (!name) continue;

              const cardNorm = name
                .replace(/\s*\([^)]*\)\s*/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();

              const matchScore = words.filter((w) => cardNorm.includes(w)).length;
              if (words.length >= 2 && matchScore < 2) continue;
              if (words.length === 1 && !cardNorm.includes(words[0])) continue;

              const fullText = name;
              let price = 0;
              const withCurrency = fullText.match(/(\d[\d\s]*)\s*[P₽р.]/i);
              if (withCurrency && withCurrency[1]) {
                price = parseFloat(withCurrency[1].replace(/\s/g, '')) || 0;
              }
              if (!price) {
                const numbers = fullText.match(/(\d[\d\s]+)/g);
                if (numbers && numbers.length) {
                  price = parseFloat(numbers[0].replace(/\s/g, '')) || 0;
                }
              }

              if (maxPrice && price > 0 && price > maxPrice) continue;

              return { name: name.substring(0, 200), price: price || 0, url };
            } catch (e) {
              console.error('Ошибка парсинга карточки:', e);
            }
          }
          return null;
        }, { maxPrice, words: searchWords });

        if (firstOffer) {
          logger.info(`✅ Найден предмет (по запросу [${langLabel}]): ${firstOffer.name} — ${firstOffer.price}₽`);
          logger.info(`🔗 URL: ${firstOffer.url}`);
          return firstOffer;
        }
      }

      logger.warn('⚠️ Предмет не найден (поиск по русскому и английскому)');
      return null;
    } catch (error) {
      logger.error('❌ Ошибка поиска предмета:', error);
      return null;
    }
  }

  /**
   * Сравнение цен с Steam и ChiBox
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
   * Покупка предмета на PlayerOk (ПОЛНЫЙ ПРОЦЕСС согласно скриншотам)
   * @param {string} itemUrl - URL страницы предмета
   * @param {string} userTradeUrl - Steam Trade URL пользователя
   * @returns {Object} Информация о покупке
   */
  async purchaseItem(itemUrl, userTradeUrl) {
    try {
      logger.info(`🛒 Начинаем покупку: ${itemUrl}`);

      // ШАГ 1: Переходим на страницу товара
      await this.page.goto(itemUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      logger.info('✅ Открыта страница товара');

      await delay(1500);

      // ШАГ 2: Нажимаем кнопку "Купить" (MUI: button с текстом "Купить")
      const buyButtonClicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const buyButton = buttons.find((btn) => {
          const t = (btn.textContent || '').trim();
          return t === 'Купить' || t.toLowerCase() === 'купить';
        });
        if (buyButton) {
          buyButton.click();
          return true;
        }
        return false;
      });

      if (!buyButtonClicked) {
        throw new Error('Кнопка "Купить" не найдена на странице товара');
      }

      logger.info('✅ Кнопка "Купить" нажата');

      // ШАГ 3: Ждем модалку "Получение" с полем "Комментарий продавцу"
      await this.page.waitForFunction(
        () => {
          const hasCommentLabel = document.body.innerText.includes('Комментарий продавцу');
          const hasNextBtn = Array.from(document.querySelectorAll('button')).some(
            (b) => (b.textContent || '').trim() === 'Далее'
          );
          return hasCommentLabel && hasNextBtn;
        },
        { timeout: 10000 }
      ).catch(() => null);
      await delay(1500);

      // ШАГ 4: Вставляем Trade URL в поле "Комментарий продавцу" (input name="commentFromBuyer", placeholder="Комментарий продавцу")
      const commentFieldFilled = await this.page.evaluate((tradeUrl) => {
        let field =
          document.querySelector('input[name="commentFromBuyer"]') ||
          document.querySelector('input[placeholder="Комментарий продавцу"]') ||
          document.querySelector('input[placeholder*="Комментарий продавцу"]') ||
          document.querySelector('textarea[placeholder*="Комментарий"]') ||
          document.querySelector('input[placeholder*="Комментарий"]') ||
          document.querySelector('input[placeholder*="коммент"]');

        if (!field) {
          const all = document.querySelectorAll('textarea, input[type="text"]:not([type="search"])');
          for (const el of all) {
            const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
            const name = (el.getAttribute('name') || '').toLowerCase();
            if (placeholder.includes('коммент') || placeholder.includes('продавцу') || name.includes('comment')) {
              field = el;
              break;
            }
          }
        }
        if (!field && document.querySelectorAll('textarea').length === 1) {
          field = document.querySelector('textarea');
        }

        if (field) {
          field.focus();
          field.value = tradeUrl;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
          field.dispatchEvent(new Event('blur', { bubbles: true }));
          return true;
        }
        return false;
      }, userTradeUrl);

      if (!commentFieldFilled) {
        throw new Error('Поле "Комментарий продавцу" не найдено в модальном окне');
      }
      logger.info('✅ Trade URL вставлен в комментарий');

      await delay(500);

      // ШАГ 5: Нажимаем "Далее"
      const nextButtonClicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const nextBtn = buttons.find((b) => (b.textContent || '').trim() === 'Далее');
        if (nextBtn) {
          nextBtn.click();
          return true;
        }
        return false;
      });

      if (!nextButtonClicked) {
        throw new Error('Кнопка "Далее" не найдена');
      }
      logger.info('✅ Кнопка "Далее" нажата');

      // ШАГ 6: Ждем шаг "Оплата" с кнопкой "Перейти к оплате"
      await this.page.waitForFunction(
        () => {
          return Array.from(document.querySelectorAll('button')).some(
            (b) => (b.textContent || '').includes('Перейти к оплате')
          );
        },
        { timeout: 10000 }
      ).catch(() => null);
      await delay(1500);

      // ШАГ 7: Включаем "Оплатить с баланса" (если ещё не включено)
      await this.page.evaluate(() => {
        const switches = document.querySelectorAll('[role="switch"], input[type="checkbox"]');
        for (const sw of switches) {
          const text = sw.closest('div')?.textContent || '';
          if (text.includes('баланс') || text.includes('Оплатить с баланса')) {
            if (sw.checked || sw.getAttribute('aria-checked') === 'true') return;
            sw.click();
            return;
          }
        }
      });
      await delay(800);

      // ШАГ 8: Нажимаем "Перейти к оплате"
      const payButtonClicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const payBtn = buttons.find((b) =>
          (b.textContent || '').trim().includes('Перейти к оплате')
        );
        if (payBtn) {
          payBtn.click();
          return true;
        }
        return false;
      });

      if (!payButtonClicked) {
        throw new Error('Кнопка "Перейти к оплате" не найдена');
      }
      logger.info('✅ Кнопка "Перейти к оплате" нажата');

      // ШАГ 9: Ждем завершения оплаты
      await delay(5000);

      // Получаем URL чата (из адресной строки)
      const currentUrl = this.page.url();
      logger.info(`📍 Текущий URL: ${currentUrl}`);

      // ШАГ 10: Переходим в чат (клик на иконку чата)
      const chatOpened = await this.page.evaluate(() => {
        // Ищем кнопку/иконку чата
        const chatButtons = Array.from(document.querySelectorAll('button, a'));
        const chatButton = chatButtons.find(btn => {
          const text = btn.textContent || '';
          const ariaLabel = btn.getAttribute('aria-label') || '';
          return text.includes('Чат') || ariaLabel.includes('chat') || ariaLabel.includes('Чат');
        });

        if (chatButton) {
          chatButton.click();
          return true;
        }

        // Альтернативно ищем прямую ссылку на чат
        const chatLink = document.querySelector('a[href*="/chats/"]');
        if (chatLink) {
          chatLink.click();
          return true;
        }

        return false;
      });

      if (!chatOpened) {
        logger.warn('⚠️ Чат не открыт автоматически, ищем в URL');
      } else {
        logger.info('✅ Чат открыт');
      }

      await delay(3000);

      // ШАГ 11: Закрываем модальное окно с предупреждением (кнопка "Понятно, спасибо")
      const modalClosed = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const okButton = buttons.find(btn =>
          btn.textContent.includes('Понятно') ||
          btn.textContent.includes('спасибо')
        );

        if (okButton) {
          okButton.click();
          return true;
        }
        return false;
      });

      if (modalClosed) {
        logger.info('✅ Модальное окно закрыто');
      }

      await delay(2000);

      // ШАГ 12: Вставляем Trade URL в чат и отправляем
      const messageSent = await this.page.evaluate((tradeUrl) => {
        // Ищем поле ввода сообщения
        const messageInput = document.querySelector('textarea[placeholder*="Сообщение"], input[placeholder*="сообщение"]');

        if (messageInput) {
          messageInput.value = tradeUrl;
          messageInput.dispatchEvent(new Event('input', { bubbles: true }));
          messageInput.dispatchEvent(new Event('change', { bubbles: true }));

          // Ищем кнопку отправки
          const sendButton = messageInput.closest('form')?.querySelector('button[type="submit"]') ||
                            document.querySelector('button[aria-label*="send"], button[aria-label*="отправить"]');

          if (sendButton) {
            sendButton.click();
            return true;
          }
        }

        return false;
      }, userTradeUrl);

      if (!messageSent) {
        logger.warn('⚠️ Trade URL не отправлен в чат автоматически');
      } else {
        logger.info('✅ Trade URL отправлен в чат продавца');
      }

      // Извлекаем ID чата из URL
      const chatId = currentUrl.match(/chats\/([a-f0-9-]+)/)?.[1] || 'unknown';

      logger.info(`✅ Покупка завершена! Chat ID: ${chatId}`);

      return {
        success: true,
        chat_id: chatId,
        chat_url: currentUrl,
        message: 'Покупка успешно оформлена, Trade URL отправлен в чат'
      };

    } catch (error) {
      logger.error('❌ Ошибка покупки предмета:', error);

      // Делаем скриншот для отладки
      try {
        await this.page.screenshot({
          path: `error-${Date.now()}.png`,
          fullPage: true
        });
        logger.info('📸 Скриншот ошибки сохранен');
      } catch (screenshotError) {
        logger.error('❌ Не удалось сделать скриншот:', screenshotError);
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Отправка Trade URL в чат продавца (УСТАРЕВШИЙ МЕТОД - теперь в purchaseItem)
   * @deprecated Используйте purchaseItem(), который включает отправку в чат
   */
  async sendTradeUrlToSeller(chatId, userTradeUrl) {
    try {
      logger.info(`💬 Отправка Trade URL в чат ${chatId}`);

      // Переходим в чат
      const chatUrl = `https://playerok.com/chats/${chatId}`;
      await this.page.goto(chatUrl, { waitUntil: 'networkidle2' });

      await delay(2000);

      // Вводим сообщение с Trade URL
      const messageSent = await this.page.evaluate((tradeUrl) => {
        const messageInput = document.querySelector('textarea[placeholder*="Сообщение"], input[placeholder*="сообщение"]');

        if (messageInput) {
          const message = `Trade URL: ${tradeUrl}`;
          messageInput.value = message;
          messageInput.dispatchEvent(new Event('input', { bubbles: true }));

          const sendButton = messageInput.closest('form')?.querySelector('button[type="submit"]');
          if (sendButton) {
            sendButton.click();
            return true;
          }
        }
        return false;
      }, userTradeUrl);

      if (messageSent) {
        logger.info('✅ Trade URL отправлен в чат');
        return { success: true };
      } else {
        throw new Error('Не удалось отправить сообщение');
      }

    } catch (error) {
      logger.error('❌ Ошибка отправки Trade URL:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Мониторинг чата с продавцом для отслеживания статуса
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
