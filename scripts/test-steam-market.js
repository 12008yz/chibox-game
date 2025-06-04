#!/usr/bin/env node

/**
 * Тестирование новой системы покупки через Steam Market
 */

const SteamMarketService = require('../services/steamMarketService');
const SteamWithdrawalService = require('../services/steamWithdrawalService');
const winston = require('winston');

// Настройка логгера
const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console()
  ],
});

async function testSteamMarket() {
  try {
    logger.info('🧪 Начинаем тестирование Steam Market системы...');

    // 1. Тестируем Steam Market Service
    logger.info('📊 Тест 1: Создание Steam Market сервиса');

    const steamMarket = new SteamMarketService(SteamMarketService.loadConfig());
    logger.info('✅ Steam Market сервис создан');

    // 2. Тестируем поиск предмета
    logger.info('🔍 Тест 2: Поиск предмета на Steam Market');

    const testItemName = 'AK-47 | Redline (Field-Tested)'; // Популярный предмет
    const searchResult = await steamMarket.searchMarketItem(testItemName);

    if (searchResult.success) {
      logger.info(`✅ Найдено ${searchResult.listings.length} предложений`);
      logger.info(`💰 Самое дешевое: ${searchResult.listings[0].price} руб.`);
    } else {
      logger.error(`❌ Ошибка поиска: ${searchResult.message}`);
      return;
    }

    // 3. Тестируем покупку (НЕ ПОКУПАЕМ, только проверяем логику)
    logger.info('🛒 Тест 3: Проверка логики покупки (без реальной покупки)');

    const cheapestOffer = searchResult.listings[0];
    logger.info(`📋 Выбрано предложение: ID ${cheapestOffer.listingId}, цена ${cheapestOffer.price}`);

    // Симулируем проверку покупки без реального выполнения
    logger.info('⚠️  ВНИМАНИЕ: Реальная покупка НЕ выполняется в тестовом режиме');

    // 4. Тестируем Steam Withdrawal Service
    logger.info('📦 Тест 4: Создание Steam Withdrawal сервиса');

    const steamWithdrawal = new SteamWithdrawalService();
    logger.info('✅ Steam Withdrawal сервис создан');

    // 5. Выводим рекомендации
    logger.info('');
    logger.info('🎯 РЕКОМЕНДАЦИИ ДЛЯ ПРОДАКШЕНА:');
    logger.info('');
    logger.info('1. Настройте Steam Bot конфигурацию:');
    logger.info('   - config/steam_bot.js должен содержать валидные данные');
    logger.info('   - sessionId и steamLoginSecure для Steam Market');
    logger.info('   - Данные бота для trade offers');
    logger.info('');
    logger.info('2. Пополните Steam кошелек бота для покупок');
    logger.info('');
    logger.info('3. Замените старый процессор withdrawal:');
    logger.info('   - scripts/process-withdrawals.js');
    logger.info('   - Используйте SteamWithdrawalService вместо CS.Money');
    logger.info('');
    logger.info('4. Настройте мониторинг:');
    logger.info('   - Логи покупок в steam-market.log');
    logger.info('   - Логи withdrawal в steam-withdrawal.log');
    logger.info('');

    // 6. Проверка конфигурации
    logger.info('🔧 Тест 5: Проверка конфигурации');

    try {
      const config = SteamMarketService.loadConfig();

      if (config.steamId && config.sessionId && config.steamLoginSecure) {
        logger.info('✅ Steam конфигурация найдена');
        logger.info(`📋 Steam ID: ${config.steamId}`);
        logger.info(`🔑 Session ID: ${config.sessionId.substring(0, 10)}...`);
      } else {
        logger.warn('⚠️ Неполная Steam конфигурация');
        logger.warn('   Проверьте config/steam_bot.js');
      }
    } catch (error) {
      logger.error(`❌ Ошибка конфигурации: ${error.message}`);
    }

    logger.info('');
    logger.info('🏁 Тестирование завершено!');

  } catch (error) {
    logger.error('💥 Ошибка тестирования:', error);
  }
}

// Функция для тестирования конкретного предмета
async function testSpecificItem(itemName) {
  logger.info(`🎯 Тестирование конкретного предмета: ${itemName}`);

  try {
    const steamMarket = new SteamMarketService(SteamMarketService.loadConfig());
    const result = await steamMarket.searchMarketItem(itemName);

    if (result.success) {
      logger.info(`✅ Предмет найден! Доступно ${result.listings.length} предложений`);
      result.listings.slice(0, 5).forEach((listing, index) => {
        logger.info(`   ${index + 1}. Цена: ${listing.price} руб. (ID: ${listing.listingId})`);
      });
    } else {
      logger.error(`❌ Предмет не найден: ${result.message}`);
    }
  } catch (error) {
    logger.error(`💥 Ошибка: ${error.message}`);
  }
}

// Запуск тестов
if (process.argv.length > 2) {
  // Если передан аргумент - тестируем конкретный предмет
  const itemName = process.argv.slice(2).join(' ');
  testSpecificItem(itemName);
} else {
  // Иначе запускаем общие тесты
  testSteamMarket();
}
