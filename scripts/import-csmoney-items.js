const CSMoneyService = require('../services/csmoneyService');
const db = require('../models');

// Метод для получения предметов через браузерный парсинг (включаем отключенный код)
async function getItemsWithPuppeteer(csmoneyService, offset = 0, limit = 60) {
  try {
    if (!csmoneyService.isLoggedIn) {
      await csmoneyService.initialize();
      if (!csmoneyService.isLoggedIn) {
        throw new Error('Не удалось авторизоваться на CS.Money');
      }
    }

    console.log('🌐 Переходим на страницу маркета CS.Money...');

    await csmoneyService.page.goto('https://cs.money/ru/market/sell-orders?limit=60&offset=0&deliverySpeed=instant', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('⏳ Ждем загрузки предметов...');
    await csmoneyService.page.waitForSelector('.market-items__item, .item-card', { timeout: 30000 });

    let previousItemCount = 0;
    let currentItemCount = 0;
    let noNewItemsCount = 0;
    const maxScrollAttempts = 50; // Уменьшим для тестирования
    const scrollDelay = 3000;
    const maxNoNewItems = 3;

    console.log('📜 Начинаем прокрутку для загрузки предметов...');

    for (let scrollAttempt = 0; scrollAttempt < maxScrollAttempts; scrollAttempt++) {
      // Считаем текущее количество предметов
      currentItemCount = await csmoneyService.page.evaluate(() => {
        return document.querySelectorAll('.market-items__item, .item-card').length;
      });

      console.log(`  📊 Попытка ${scrollAttempt + 1}/${maxScrollAttempts}: найдено ${currentItemCount} предметов`);

      // Если количество предметов не изменилось, увеличиваем счетчик
      if (currentItemCount === previousItemCount) {
        noNewItemsCount++;
        console.log(`    ⏸️  Новые предметы не загрузились (${noNewItemsCount}/${maxNoNewItems})`);

        if (noNewItemsCount >= maxNoNewItems) {
          console.log('    ✅ Достигнут лимит попыток. Завершаем прокрутку.');
          break;
        }
      } else {
        // Сбрасываем счетчик если загрузились новые предметы
        noNewItemsCount = 0;
        console.log(`    🆕 Загружено ${currentItemCount - previousItemCount} новых предметов`);
      }

      previousItemCount = currentItemCount;

      // Прокручиваем страницу вниз плавно
      await csmoneyService.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Ждем загрузки новых предметов
      await new Promise(resolve => setTimeout(resolve, scrollDelay));

      // Дополнительно ждем появления новых элементов
      try {
        await csmoneyService.page.waitForFunction(
          (prevCount) => document.querySelectorAll('.market-items__item, .item-card').length > prevCount,
          { timeout: 5000 },
          currentItemCount
        );
        console.log('    ✨ Обнаружены новые предметы после прокрутки');
      } catch (waitError) {
        console.log('    ⏳ Новые предметы не появились в течение 5 секунд');
      }

      // Ограничиваем количество для тестирования
      if (currentItemCount >= limit) {
        console.log(`    🎯 Достигнут лимит ${limit} предметов. Завершаем прокрутку.`);
        break;
      }
    }

    console.log(`📋 Завершена прокрутка. Итого найдено: ${currentItemCount} предметов`);

    // Парсим предметы со страницы
    console.log('🔍 Извлекаем данные предметов...');
    const itemsFromPage = await csmoneyService.page.evaluate(() => {
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
      console.log(`✅ Получено ${itemsFromPage.length} предметов через парсинг страницы`);
      return {
        success: true,
        items: itemsFromPage,
        total: itemsFromPage.length
      };
    }

    console.log('❌ Не удалось получить предметы через парсинг страницы');
    return {
      success: false,
      message: 'Не удалось получить предметы с CS.Money',
      items: []
    };

  } catch (error) {
    console.error(`❌ Ошибка при получении предметов через Puppeteer: ${error.message}`);
    return {
      success: false,
      message: error.message,
      items: []
    };
  }
}

async function importWithPuppeteer() {
  let csmoneyService = null;

  try {
    console.log('🚀 Запуск импорта предметов через Puppeteer...');

    // Загружаем конфигурацию
    const config = CSMoneyService.loadConfig();
    console.log('✅ Конфигурация загружена');
    console.log(`👤 Steam ID: ${config.steamId || 'не указан'}`);

    // Создаем экземпляр сервиса
    csmoneyService = new CSMoneyService(config);

    // Инициализируем браузер и проверяем авторизацию
    console.log('🔧 Инициализация браузера...');
    await csmoneyService.initialize();

    if (!csmoneyService.isLoggedIn) {
      console.error('❌ Не удалось авторизоваться на CS.Money');
      console.log('💡 Попробуйте обновить cookies:');
      console.log('   node scripts/update-csmoney-cookies.js');
      return;
    }

    console.log('✅ Успешно авторизованы на CS.Money');

    // Сначала пробуем API
    console.log('\n🔄 Попытка получения данных через API...');
    let result = await csmoneyService.getItems(0, 60);

    // Если API не работает, используем браузерный парсинг
    if (!result.success) {
      console.log(`⚠️  API недоступен: ${result.message}`);
      console.log('🌐 Переключаемся на браузерный парсинг...');

      result = await getItemsWithPuppeteer(csmoneyService, 0, 100);
    }

    if (!result.success) {
      console.error(`❌ Ошибка получения предметов: ${result.message}`);
      return;
    }

    const items = result.items || [];
    console.log(`\n✅ Получено ${items.length} предметов`);

    if (items.length === 0) {
      console.log('⚠️  Нет предметов для импорта');
      return;
    }

    // Выводим первые 5 предметов для проверки
    console.log('\n📋 Примеры предметов:');
    items.slice(0, 5).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name} - ${item.price} руб.`);
    });

    // Импортируем в базу данных
    console.log('\n💾 Импортируем предметы в базу данных...');
    await csmoneyService.importItemsToDb(items);

    // Проверяем результат
    const totalItems = await db.Item.count();
    console.log(`\n📊 РЕЗУЛЬТАТ ИМПОРТА:`);
    console.log(`✅ Всего предметов в базе: ${totalItems}`);

    // Показываем последние добавленные предметы
    const recentItems = await db.Item.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5,
      attributes: ['name', 'price', 'rarity']
    });

    console.log('\n🆕 Последние добавленные предметы:');
    recentItems.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name} - ${item.price} руб. (${item.rarity})`);
    });

  } catch (error) {
    console.error('❌ Критическая ошибка:', error.message);

    // Показываем более детальную информацию об ошибке
    if (error.message.includes('connect ECONNREFUSED')) {
      console.log('\n💡 Решение: Запустите PostgreSQL базу данных');
    } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
      console.log('\n💡 Решение: Обновите cookies CS.Money');
      console.log('   node scripts/update-csmoney-cookies.js');
    } else if (error.message.includes('puppeteer')) {
      console.log('\n💡 Решение: Установите Puppeteer');
      console.log('   npm install puppeteer');
    }
  } finally {
    // Закрываем браузер
    if (csmoneyService) {
      await csmoneyService.close();
      console.log('🔐 Браузер закрыт');
    }
  }
}

// Запускаем импорт
importWithPuppeteer();
