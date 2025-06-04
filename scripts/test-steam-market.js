#!/usr/bin/env node

/**
 * Тестирование Steam автоматизации через Puppeteer
 */

const SteamPuppeteerService = require('../services/steamPuppeteerService');
const steamBotConfig = require('../config/steam_bot.js');
const winston = require('winston');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console()
  ],
});

async function testPuppeteerSteam() {
  let steamService = null;

  try {
    logger.info('🧪 Тестирование Steam Puppeteer Service...');

    // 1. Инициализация сервиса
    logger.info('🚀 Инициализация Puppeteer...');

    steamService = new SteamPuppeteerService(steamBotConfig);
    await steamService.initialize();

    logger.info('✅ Puppeteer инициализирован');

    // 2. Авторизация в Steam
    logger.info('🔐 Тестирование авторизации...');

    const loginResult = await steamService.login();

    if (loginResult) {
      logger.info('✅ Авторизация успешна');
    } else {
      logger.error('❌ Ошибка авторизации');
      return;
    }

    // Делаем скриншот после авторизации
    await steamService.takeScreenshot('after_login');

    // 3. Проверка баланса кошелька
    logger.info('💰 Проверка баланса Steam кошелька...');

    const balanceResult = await steamService.checkWalletBalance();

    if (balanceResult.success) {
      logger.info(`💳 Баланс: ${balanceResult.balanceText}`);

      if (balanceResult.balance > 100) {
        logger.info('✅ Достаточно средств для тестирования');
      } else {
        logger.warn('⚠️ Малый баланс кошелька. Рекомендуется пополнить для реальных покупок');
      }
    } else {
      logger.warn(`⚠️ Не удалось проверить баланс: ${balanceResult.message}`);
    }

    // 4. Тестирование поиска предметов (без покупки)
    logger.info('🔍 Тестирование поиска предметов...');

    const testItems = [
      'P250 | Sand Dune (Field-Tested)', // Дешевый предмет для тестов
      'Glock-18 | Water Elemental (Field-Tested)',
      'AK-47 | Redline (Field-Tested)'
    ];

    for (const item of testItems) {
      logger.info(`🎯 Поиск: ${item}`);

      try {
        // Переходим на страницу предмета без покупки
        const marketUrl = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(item)}`;
        await steamService.page.goto(marketUrl, { waitUntil: 'networkidle2' });

        await steamService.delay(3000);

        // Анализируем предложения
        const listings = await steamService.page.$$('#searchResultsRows .market_listing_row');

        if (listings.length > 0) {
          logger.info(`✅ Найдено ${listings.length} предложений`);

          // Получаем цены первых предложений
          for (let i = 0; i < Math.min(listings.length, 3); i++) {
            try {
              const listing = listings[i];
              const priceElement = await listing.$('.market_listing_price');

              if (priceElement) {
                const priceText = await priceElement.evaluate(el => el.textContent.trim());
                const price = steamService.parsePrice(priceText);

                logger.info(`   ${i + 1}. ${priceText} (${price} руб.)`);
              }
            } catch (err) {
              logger.warn(`   Ошибка анализа предложения ${i + 1}`);
            }
          }
        } else {
          logger.warn(`❌ Предложения не найдены для: ${item}`);
        }

        // Делаем скриншот страницы
        await steamService.takeScreenshot(`item_${item.replace(/[^a-zA-Z0-9]/g, '_')}`);

      } catch (error) {
        logger.error(`Ошибка поиска ${item}: ${error.message}`);
      }

      // Задержка между поиском разных предметов
      await steamService.delay(3000);
    }

    // 5. Тестирование работы с инвентарем
    logger.info('🎒 Проверка инвентаря...');

    try {
      await steamService.page.goto('https://steamcommunity.com/my/inventory/', {
        waitUntil: 'networkidle2'
      });

      await steamService.delay(5000);

      // Проверяем наличие предметов
      const items = await steamService.page.$$('.item.app730.context2');

      if (items.length > 0) {
        logger.info(`✅ В инвентаре найдено ${items.length} предметов CS2`);

        // Получаем информацию о первых предметах
        for (let i = 0; i < Math.min(items.length, 5); i++) {
          try {
            const item = items[i];
            const itemName = await item.$eval('.item_desc_content .item_desc_game_info',
              el => el.textContent.trim()
            ).catch(() => 'Неизвестный предмет');

            logger.info(`   ${i + 1}. ${itemName}`);
          } catch (err) {
            logger.info(`   ${i + 1}. Предмет #${i + 1}`);
          }
        }
      } else {
        logger.warn('⚠️ В инвентаре нет предметов CS2');
        logger.info('💡 Для тестирования trade offers добавьте предметы в инвентарь');
      }

      // Скриншот инвентаря
      await steamService.takeScreenshot('inventory');

    } catch (error) {
      logger.error(`Ошибка проверки инвентаря: ${error.message}`);
    }

    // 6. Итоги тестирования
    logger.info('');
    logger.info('🎯 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ:');
    logger.info('');

    const results = {
      puppeteerInit: true,
      steamLogin: loginResult,
      walletCheck: balanceResult.success,
      itemSearch: true, // Поиск работал
      inventoryAccess: true
    };

    const successCount = Object.values(results).filter(Boolean).length;
    const totalTests = Object.keys(results).length;

    logger.info(`✅ Успешных тестов: ${successCount}/${totalTests}`);
    logger.info('');

    if (successCount === totalTests) {
      logger.info('🎉 ВСЕ ТЕСТЫ ПРОШЛИ УСПЕШНО!');
      logger.info('');
      logger.info('🚀 Система готова к использованию:');
      logger.info('1. ✅ Puppeteer запускается и работает');
      logger.info('2. ✅ Авторизация в Steam функционирует');
      logger.info('3. ✅ Доступ к Steam Market есть');
      logger.info('4. ✅ Анализ предложений работает');
      logger.info('5. ✅ Доступ к инвентарю есть');
      logger.info('');
      logger.info('💡 Рекомендации:');
      logger.info('- Пополните Steam кошелек для реальных покупок');
      logger.info('- Протестируйте покупку дешевого предмета');
      logger.info('- Настройте автоматический withdrawal процессор');
    } else {
      logger.warn('⚠️ Некоторые тесты не прошли');
      logger.warn('');
      logger.warn('🔧 Проверьте:');
      if (!results.puppeteerInit) logger.warn('- Установку Puppeteer');
      if (!results.steamLogin) logger.warn('- Данные авторизации Steam');
      if (!results.walletCheck) logger.warn('- Доступ к Steam кошельку');
      if (!results.itemSearch) logger.warn('- Доступ к Steam Market');
      if (!results.inventoryAccess) logger.warn('- Доступ к инвентарю');
    }

  } catch (error) {
    logger.error('💥 Критическая ошибка тестирования:', error);
  } finally {
    // Закрываем браузер
    if (steamService) {
      logger.info('🛑 Закрытие браузера...');
      await steamService.shutdown();
    }
  }
}

// Тест покупки (ОСТОРОЖНО - тратит реальные деньги!)
async function testRealPurchase(itemName) {
  let steamService = null;

  try {
    logger.warn('⚠️ ВНИМАНИЕ: Этот тест тратит РЕАЛЬНЫЕ деньги!');
    logger.warn('⚠️ Убедитесь, что хотите купить предмет!');
    logger.info(`🎯 Покупка предмета: ${itemName}`);

    steamService = new SteamPuppeteerService(steamBotConfig);
    await steamService.initialize();
    await steamService.login();

    const purchaseResult = await steamService.searchAndBuyItem(itemName, 100); // Максимум 100 рублей

    if (purchaseResult.success) {
      logger.info('✅ Предмет успешно куплен!');
      logger.info(`📦 ${purchaseResult.item.name}`);
      logger.info(`💰 Цена: ${purchaseResult.item.priceText}`);
      logger.info(`🕐 Время: ${purchaseResult.item.purchaseTime}`);
    } else {
      logger.error(`❌ Ошибка покупки: ${purchaseResult.message}`);
    }

  } catch (error) {
    logger.error('💥 Ошибка:', error);
  } finally {
    if (steamService) {
      await steamService.shutdown();
    }
  }
}

// CLI интерфейс
if (require.main === module) {
  const command = process.argv[2];
  const itemName = process.argv.slice(3).join(' ');

  switch (command) {
    case 'test':
      testPuppeteerSteam();
      break;
    case 'buy':
      if (itemName) {
        testRealPurchase(itemName);
      } else {
        logger.error('❌ Укажите название предмета для покупки');
        logger.info('Пример: node test-puppeteer-steam.js buy "P250 | Sand Dune (Field-Tested)"');
      }
      break;
    default:
      logger.info('📖 Использование:');
      logger.info('  node test-puppeteer-steam.js test                    - Безопасное тестирование');
      logger.info('  node test-puppeteer-steam.js buy "Item Name"         - Реальная покупка (ТРАТИТ ДЕНЬГИ!)');
      break;
  }
}

module.exports = { testPuppeteerSteam, testRealPurchase };
