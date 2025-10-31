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
   * Поиск предмета на PlayerOk
   * @param {string} itemName - Название предмета (например "Desert Eagle Оксидное пламя")
   * @param {number} maxPrice - Максимальная цена для покупки
   * @returns {Object} Первое найденное предложение или null
   */
  async searchItem(itemName, maxPrice = null) {
    try {
      logger.info(`🔍 Поиск предмета: "${itemName}" (макс. цена: ${maxPrice || 'не ограничена'}₽)`);

      // Переходим на страницу CS2 скинов (ПРАВИЛЬНЫЙ URL из скриншотов)
      await this.page.goto('https://playerok.com/games/counter-strike-2/skins', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      logger.info('✅ Открыта страница скинов CS2');

      // Ждем появления поля поиска (ПРАВИЛЬНЫЙ селектор из HTML)
      await this.page.waitForSelector('input[name="search"]', { timeout: 10000 });

      // Очищаем поле поиска и вводим название
      await this.page.click('input[name="search"]', { clickCount: 3 });
      await this.page.type('input[name="search"]', itemName, { delay: 100 });

      logger.info('✅ Текст введен в поиск');

      // Ждём появления результатов (даем время на подгрузку)
      await this.page.waitForTimeout(3000);

      // Ищем карточки товаров
      const firstOffer = await this.page.evaluate((maxPrice) => {
        // Ищем все карточки товаров
        const cards = document.querySelectorAll('a[href*="/products/"]');

        for (const card of cards) {
          try {
            // Получаем название товара
            const name = card.textContent.trim();

            // Получаем цену (ищем элемент с ценой внутри карточки)
            const priceText = card.querySelector('[class*="price"]')?.textContent || '';
            const price = parseFloat(priceText.replace(/[^\d]/g, ''));

            // Получаем URL
            const url = card.href;

            if (!price || !url) continue;

            // Фильтруем по максимальной цене
            if (maxPrice && price > maxPrice) {
              continue;
            }

            // Возвращаем первое подходящее предложение
            return {
              name: name,
              price: price,
              url: url
            };
          } catch (e) {
            console.error('Ошибка парсинга карточки:', e);
          }
        }

        return null;
      }, maxPrice);

      if (!firstOffer) {
        logger.warn('⚠️ Предмет не найден или превышает максимальную цену');
        return null;
      }

      logger.info(`✅ Найден предмет: ${firstOffer.price}₽`);
      logger.info(`🔗 URL: ${firstOffer.url}`);

      return firstOffer;
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

      // ШАГ 2: Нажимаем зеленую кнопку "Купить"
      await this.page.waitForTimeout(2000);

      // Ищем зеленую кнопку "Купить" (по тексту или цвету)
      const buyButtonClicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const buyButton = buttons.find(btn =>
          btn.textContent.includes('Купить') ||
          btn.textContent.includes('купить')
        );

        if (buyButton) {
          buyButton.click();
          return true;
        }
        return false;
      });

      if (!buyButtonClicked) {
        throw new Error('Кнопка "Купить" не найдена');
      }

      logger.info('✅ Кнопка "Купить" нажата');

      // ШАГ 3: Ждем появления модального окна
      await this.page.waitForTimeout(2000);

      // ШАГ 4: Вставляем Trade URL в поле "Комментарий продавцу"
      // Поле находится в модальном окне (из скриншота видно, что там есть только одно текстовое поле)
      const commentFieldFilled = await this.page.evaluate((tradeUrl) => {
        // Ищем все textarea или input type="text" в модальном окне
        const textFields = document.querySelectorAll('textarea, input[type="text"]');

        // Находим поле комментария (обычно это textarea или input с placeholder)
        let commentField = null;
        for (const field of textFields) {
          const placeholder = field.placeholder || '';
          const label = field.closest('div')?.textContent || '';

          if (placeholder.includes('коммент') || label.includes('Комментарий')) {
            commentField = field;
            break;
          }
        }

        // Если не нашли по placeholder, берем первое доступное поле
        if (!commentField && textFields.length > 0) {
          commentField = textFields[0];
        }

        if (commentField) {
          commentField.value = tradeUrl;
          commentField.dispatchEvent(new Event('input', { bubbles: true }));
          commentField.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }

        return false;
      }, userTradeUrl);

      if (!commentFieldFilled) {
        logger.warn('⚠️ Поле комментария не найдено, продолжаем без него');
      } else {
        logger.info('✅ Trade URL вставлен в комментарий');
      }

      await this.page.waitForTimeout(1000);

      // ШАГ 5: Нажимаем синюю кнопку "Далее"
      const nextButtonClicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const nextButton = buttons.find(btn =>
          btn.textContent.includes('Далее') ||
          btn.textContent.includes('далее')
        );

        if (nextButton) {
          nextButton.click();
          return true;
        }
        return false;
      });

      if (!nextButtonClicked) {
        throw new Error('Кнопка "Далее" не найдена');
      }

      logger.info('✅ Кнопка "Далее" нажата');

      // ШАГ 6: Ждем страницу оплаты
      await this.page.waitForTimeout(2000);

      // ШАГ 7: Включаем переключатель "Оплатить с баланса"
      const balanceToggleEnabled = await this.page.evaluate(() => {
        // Ищем переключатель (по скриншоту это MUI Switch)
        const switches = document.querySelectorAll('[role="switch"], input[type="checkbox"]');

        for (const switchEl of switches) {
          const parent = switchEl.closest('div');
          const text = parent?.textContent || '';

          if (text.includes('баланс') || text.includes('Оплатить с баланса')) {
            // Проверяем, не включен ли уже
            if (switchEl.checked || switchEl.getAttribute('aria-checked') === 'true') {
              return true; // Уже включен
            }

            // Кликаем на переключатель
            switchEl.click();
            return true;
          }
        }

        return false;
      });

      if (!balanceToggleEnabled) {
        logger.warn('⚠️ Переключатель баланса не найден или уже включен');
      } else {
        logger.info('✅ Выбрана оплата с баланса');
      }

      await this.page.waitForTimeout(1000);

      // ШАГ 8: Нажимаем синюю кнопку "Перейти к оплате"
      const payButtonClicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const payButton = buttons.find(btn =>
          btn.textContent.includes('Перейти к оплате') ||
          btn.textContent.includes('оплате')
        );

        if (payButton) {
          payButton.click();
          return true;
        }
        return false;
      });

      if (!payButtonClicked) {
        throw new Error('Кнопка "Перейти к оплате" не найдена');
      }

      logger.info('✅ Кнопка "Перейти к оплате" нажата');

      // ШАГ 9: Ждем завершения оплаты и перехода на страницу заказа
      await this.page.waitForTimeout(5000);

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

      await this.page.waitForTimeout(3000);

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

      await this.page.waitForTimeout(2000);

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

      await this.page.waitForTimeout(2000);

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
