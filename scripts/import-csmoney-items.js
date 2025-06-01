const { chromium } = require('playwright');
const db = require('../models');
const path = require('path');
const fs = require('fs');

async function importCSMoneyItemsBrowser() {
  let browser = null;
  let page = null;

  try {
    console.log('🚀 Запуск импорта предметов CSMoney через браузер...');

    // Загружаем конфигурацию
    const configPath = path.join(__dirname, '../config/csmoney_config.json');
    let config = {};

    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log('✅ Конфигурация загружена');
    } else {
      console.log('⚠️  Конфигурация не найдена, работаем без cookies');
    }

    // Запускаем браузер
    browser = await chromium.launch({
      headless: false, // Покажем браузер для отладки
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
    });

    page = await context.newPage();

    // Добавляем cookies если есть
    if (config.cookies) {
      console.log('🍪 Добавляем cookies...');

      const cookies = config.cookies.split('; ').map(cookie => {
        const [name, value] = cookie.split('=');
        return {
          name: name.trim(),
          value: value ? value.trim() : '',
          domain: '.cs.money',
          path: '/'
        };
      });

      await context.addCookies(cookies);
      console.log(`✅ Добавлено ${cookies.length} cookies`);
    }

    // Идем на страницу маркета
    console.log('🌐 Переходим на CSMoney...');
    await page.goto('https://cs.money/ru/market/buy/', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    console.log('⏳ Ждем загрузки страницы...');
    await page.waitForTimeout(3000);

    // Проверяем авторизацию
    try {
      const isLoggedIn = await page.locator('[data-testid="user-avatar"], .user-avatar, .avatar').first().isVisible({ timeout: 5000 });
      if (isLoggedIn) {
        console.log('✅ Пользователь авторизован');
      } else {
        console.log('⚠️  Пользователь не авторизован, но продолжаем');
      }
    } catch (e) {
      console.log('⚠️  Не удалось определить статус авторизации');
    }

    // Ждем загрузки предметов
    console.log('🔍 Ищем предметы на странице...');

    const itemSelectors = [
      '[data-testid="skin-card"]',
      '.skin-card',
      '.item-card',
      '.market-item',
      '.inventory-item',
      '[class*="item"]',
      '[class*="skin"]',
      '[class*="card"]'
    ];

    let items = [];

    // Пробуем разные селекторы
    for (const selector of itemSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 10000 });
        items = await page.locator(selector).all();
        if (items.length > 0) {
          console.log(`✅ Найдено ${items.length} предметов с селектором: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`❌ Селектор ${selector} не сработал`);
      }
    }

    if (items.length === 0) {
      console.log('❌ Предметы не найдены на странице');

      // Делаем скриншот для отладки
      await page.screenshot({ path: 'csmoney_debug.png', fullPage: true });
      console.log('📸 Скриншот сохранен как csmoney_debug.png');

      // Выводим HTML страницы
      const content = await page.content();
      fs.writeFileSync('csmoney_page.html', content);
      console.log('📄 HTML страницы сохранен как csmoney_page.html');

      return;
    }

    console.log(`🎯 Начинаем парсинг ${items.length} предметов...`);

    let processedCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    // Обрабатываем первые 10 предметов для теста
    const itemsToProcess = items.slice(0, Math.min(10, items.length));

    for (let i = 0; i < itemsToProcess.length; i++) {
      try {
        const item = itemsToProcess[i];

        console.log(`📦 Обработка предмета ${i + 1}/${itemsToProcess.length}...`);

        // Извлекаем данные о предмете
        const itemData = await item.evaluate((element) => {
          // Ищем название
          const nameSelectors = [
            '[data-testid="skin-name"]',
            '.skin-name',
            '.item-name',
            '.card-title',
            'h3', 'h4', 'h5',
            '[class*="name"]',
            '[class*="title"]'
          ];

          let name = '';
          for (const selector of nameSelectors) {
            const nameEl = element.querySelector(selector);
            if (nameEl && nameEl.textContent.trim()) {
              name = nameEl.textContent.trim();
              break;
            }
          }

          // Ищем цену
          const priceSelectors = [
            '[data-testid="price"]',
            '.price',
            '.cost',
            '[class*="price"]',
            '[class*="cost"]',
            '[class*="money"]'
          ];

          let price = '';
          for (const selector of priceSelectors) {
            const priceEl = element.querySelector(selector);
            if (priceEl && priceEl.textContent.trim()) {
              price = priceEl.textContent.trim();
              break;
            }
          }

          // Ищем изображение
          const imgSelectors = [
            'img[src*="steamcommunity"]',
            'img[src*="steam"]',
            'img',
            '[data-testid="skin-image"] img'
          ];

          let imageUrl = '';
          for (const selector of imgSelectors) {
            const imgEl = element.querySelector(selector);
            if (imgEl && imgEl.src) {
              imageUrl = imgEl.src;
              break;
            }
          }

          return {
            name: name || 'Unknown Item',
            price: price,
            imageUrl: imageUrl,
            rawHTML: element.innerHTML.substring(0, 500) // Для отладки
          };
        });

        if (itemData.name && itemData.name !== 'Unknown Item') {
          console.log(`  📝 ${itemData.name}`);
          console.log(`  💰 ${itemData.price}`);

          // Парсим цену
          let numericPrice = 0;
          if (itemData.price) {
            const priceMatch = itemData.price.match(/[\d,]+\.?\d*/);
            if (priceMatch) {
              numericPrice = parseFloat(priceMatch[0].replace(',', ''));
            }
          }

          // Проверяем, существует ли предмет в базе
          const existingItem = await db.Item.findOne({
            where: { name: itemData.name }
          });

          if (existingItem) {
            // Обновляем существующий предмет
            await existingItem.update({
              price: numericPrice,
              image_url: itemData.imageUrl || existingItem.image_url,
              is_available: true
            });
            updatedCount++;
          } else {
            // Создаем новый предмет
            await db.Item.create({
              name: itemData.name,
              price: numericPrice,
              image_url: itemData.imageUrl,
              rarity: 'consumer', // По умолчанию
              drop_weight: 1.0, // По умолчанию
              min_subscription_tier: 0,
              is_available: true
            });
            createdCount++;
          }

          processedCount++;
        } else {
          console.log(`  ⚠️  Предмет ${i + 1}: данные не извлечены`);
          console.log(`     HTML: ${itemData.rawHTML.substring(0, 100)}...`);
          errorCount++;
        }

        // Небольшая пауза между предметами
        await page.waitForTimeout(500);

      } catch (error) {
        console.error(`❌ Ошибка при обработке предмета ${i + 1}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📊 РЕЗУЛЬТАТЫ ИМПОРТА:');
    console.log(`✅ Обработано: ${processedCount}`);
    console.log(`🆕 Создано: ${createdCount}`);
    console.log(`🔄 Обновлено: ${updatedCount}`);
    console.log(`❌ Ошибок: ${errorCount}`);

  } catch (error) {
    console.error('❌ Критическая ошибка:', error);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
    console.log('🔐 Браузер закрыт');
  }
}

// Запускаем импорт
importCSMoneyItemsBrowser();
