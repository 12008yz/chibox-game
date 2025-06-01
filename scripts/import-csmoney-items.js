const CSMoneyService = require('../services/csmoneyService');
const db = require('../models');

async function importWithBrowser() {
  let csmoneyService = null;

  try {
    console.log('🚀 Запуск импорта предметов через браузер...');

    // Загружаем конфигурацию
    const config = CSMoneyService.loadConfig();
    console.log('✅ Конфигурация загружена');
    console.log(`👤 Steam ID: ${config.steamId || 'не указан'}`);
    console.log(`🌐 User-Agent: ${config.userAgent ? 'установлен' : 'по умолчанию'}`);

    // Создаем экземпляр сервиса
    csmoneyService = new CSMoneyService(config);

    console.log('🔧 Инициализация браузера...');
    await csmoneyService.initialize();

    if (!csmoneyService.isLoggedIn) {
      console.error('❌ Не удалось авторизоваться на CS.Money');
      console.log('💡 Попробуйте обновить cookies');
      return;
    }

    console.log('✅ Успешно авторизованы на CS.Money');
    console.log('🌐 Загружаем предметы через API...');

    // Загружаем предметы через API endpoint
    const limit = 60; // Максимальное количество предметов за один запрос (ограничение API)
    let offset = 0;
    const maxItems = 500; // Максимальное количество предметов для импорта
    let allItems = [];

    while (allItems.length < maxItems) {
      const apiUrl = `https://cs.money/2.0/market/sell-orders/?limit=${limit}&offset=${offset}`;
      console.log(`📡 Запрос к API: ${apiUrl} (offset: ${offset})`);

      try {
        await csmoneyService.page.goto(apiUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000
        });

        // Получаем JSON ответ со страницы
        const jsonResponse = await csmoneyService.page.evaluate(() => {
          try {
            return JSON.parse(document.body.innerText);
          } catch {
            return null;
          }
        });

        if (jsonResponse && jsonResponse.items && Array.isArray(jsonResponse.items)) {
          console.log(`✅ Получено ${jsonResponse.items.length} предметов с offset ${offset}`);
          allItems.push(...jsonResponse.items);

          // Если получили меньше предметов чем limit, значит это последняя страница
          if (jsonResponse.items.length < limit) {
            console.log('📄 Достигнут конец списка предметов');
            break;
          }

          offset += limit;
          await new Promise(resolve => setTimeout(resolve, 1000)); // Пауза между запросами
        } else {
          console.log('❌ Не удалось получить данные или неожиданная структура ответа');
          console.log('🔍 Ответ сервера:', JSON.stringify(jsonResponse).substring(0, 200));
          break;
        }
      } catch (error) {
        console.error(`❌ Ошибка загрузки API: ${error.message}`);
        break;
      }
    }

    console.log(`📦 Всего загружено предметов: ${allItems.length}`);

    // Используем загруженные данные
    const interceptedData = allItems;

    console.log(`\n📋 Загружено ${interceptedData.length} предметов через API`);



    if (interceptedData.length === 0) {
      console.log('⚠️ Не удалось получить данные через API, попробуем парсинг страницы...');

      // Fallback: парсинг предметов со страницы
      const pageItems = await csmoneyService.page.evaluate(() => {
        const items = [];
        const itemElements = document.querySelectorAll('[data-testid="market-item"], .market-item, .item-card');

        itemElements.forEach((element, index) => {
          try {
            const nameEl = element.querySelector('[data-testid="item-name"], .item-name, .name');
            const priceEl = element.querySelector('[data-testid="item-price"], .item-price, .price');
            const imageEl = element.querySelector('img');

            const name = nameEl?.textContent?.trim() || `Item ${index + 1}`;
            const priceText = priceEl?.textContent?.trim() || '0';
            const priceMatch = priceText.match(/[\d.,]+/);
            const price = priceMatch ? parseFloat(priceMatch[0].replace(',', '.')) : 0;
            const image = imageEl?.src || imageEl?.getAttribute('data-src') || '';

            items.push({
              id: `page_${Date.now()}_${index}`,
              name: name,
              price: price,
              image: image,
              source: 'page_parsing'
            });
          } catch (error) {
            console.error(`Ошибка парсинга элемента ${index}:`, error);
          }
        });

        return items;
      });

      console.log(`📄 Получено ${pageItems.length} предметов через парсинг страницы`);
      interceptedData.push(...pageItems);
    }

    if (interceptedData.length === 0) {
      console.log('❌ Не удалось получить предметы ни через API, ни через парсинг');
      return;
    }

    // Обрабатываем и форматируем данные
    console.log('\n🔄 Обработка полученных данных...');
    console.log(`📊 Всего получено записей: ${interceptedData.length}`);

    // Показываем примеры сырых данных
    if (interceptedData.length > 0) {
      console.log('🔍 Пример сырых данных:');
      console.log(JSON.stringify(interceptedData[0], null, 2).substring(0, 500) + '...');
    }

    const formattedItems = interceptedData.map(item => {
      // Данные приходят напрямую как объекты предметов
      // Структура: { id, asset: { names, images, ... }, pricing, stickers, etc }

      if (item.asset) {
        const fullName = item.asset?.names?.full || '';
        let exterior = null;
        if (fullName.includes('Factory New')) exterior = 'Factory New';
        else if (fullName.includes('Minimal Wear')) exterior = 'Minimal Wear';
        else if (fullName.includes('Field-Tested')) exterior = 'Field-Tested';
        else if (fullName.includes('Well-Worn')) exterior = 'Well-Worn';
        else if (fullName.includes('Battle-Scarred')) exterior = 'Battle-Scarred';

        return {
          id: item.id,
          name: fullName,
          price: item.pricing?.computed || item.pricing?.default || 0,
          float: item.asset?.float || null,
          image: item.asset?.images?.steam || item.asset?.images?.screenshot || '',
          type: csmoneyService.getWeaponType(fullName),
          rarity: item.asset?.rarity || '',
          exterior: exterior,
          pattern: item.asset?.pattern || null,
          stickers: item.stickers || [],
          keychains: item.keychains || [],
          isStatTrak: item.asset?.isStatTrak || false,
          isSouvenir: item.asset?.isSouvenir || false,
          is_tradable: !item.isMySellOrder,
          in_stock: true,
          assetId: item.asset?.id || null,
          source: 'api'
        };
      } else {
        // Данные от парсинга страницы
        return {
          id: item.id,
          name: item.name,
          price: item.price,
          image: item.image,
          type: csmoneyService.getWeaponType(item.name),
          rarity: 'unknown',
          is_tradable: true,
          in_stock: true,
          source: 'page_parsing'
        };
      }
    });

    // Удаляем дубликаты по ID
    const uniqueItems = formattedItems.filter((item, index, self) =>
      index === self.findIndex(t => t.id === item.id)
    );

    console.log(`✅ Обработано ${uniqueItems.length} уникальных предметов`);

    // Показываем примеры
    console.log('\n📋 Примеры полученных предметов:');
    uniqueItems.slice(0, 5).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name} - $${item.price} (${item.source})`);
      if (item.float) console.log(`     Float: ${item.float}`);
    });

    // Импортируем в базу данных
    console.log('\n💾 Импорт в базу данных...');

    let importedCount = 0;
    for (const item of uniqueItems) {
      try {
        console.log(`🔄 Импортирую: ${item.name} (ID: ${item.id})`);
        await csmoneyService.importItemsToDb([item]);
        importedCount++;

        if (importedCount % 10 === 0) {
          console.log(`📦 Импортировано: ${importedCount}/${uniqueItems.length}`);
        }
      } catch (error) {
        console.error(`❌ Ошибка импорта ${item.name}: ${error.message}`);
        console.error(`📋 Данные предмета:`, JSON.stringify(item, null, 2));
      }
    }

    // Финальная статистика
    const totalItemsInDb = await db.Item.count();
    console.log(`\n📊 РЕЗУЛЬТАТ ИМПОРТА:`);
    console.log(`✅ Импортировано предметов: ${importedCount}`);
    console.log(`📦 Всего предметов в базе: ${totalItemsInDb}`);
    console.log(`🌐 Источник данных: ${uniqueItems.some(i => i.source === 'api') ? 'API + Парсинг' : 'Только парсинг'}`);

  } catch (error) {
    console.error('❌ Критическая ошибка:', error.message);
    console.error('Stack trace:', error.stack);

    if (error.message.includes('net::ERR_INTERNET_DISCONNECTED')) {
      console.log('\n💡 Решение: Проверьте интернет-соединение');
    } else if (error.message.includes('Navigation timeout')) {
      console.log('\n💡 Решение: Сайт загружается медленно, попробуйте еще раз');
    } else if (error.message.includes('puppeteer')) {
      console.log('\n💡 Решение: Установите Puppeteer: npm install puppeteer');
    }
  } finally {
    if (csmoneyService) {
      await csmoneyService.close();
      console.log('🔐 Браузер закрыт');
    }
  }
}

// Запускаем импорт
if (require.main === module) {
  importWithBrowser();
}

module.exports = { importWithBrowser };
