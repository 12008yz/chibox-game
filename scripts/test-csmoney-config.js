#!/usr/bin/env node

/**
 * Скрипт для тестирования конфигурации и доступа к CS.Money
 * Запускается командой: node scripts/test-csmoney-config.js
 */

const CSMoneyService = require('../services/csmoneyService');

async function testCSMoneyConfig() {
  console.log('=== Тестирование конфигурации CS.Money ===');

  // Загружаем конфигурацию
  const config = CSMoneyService.loadConfig();
  console.log('Конфигурация загружена:');
  console.log('- Cookies установлены:', !!config.cookies);
  console.log('- CSRF-токен установлен:', !!config.csrfToken);
  console.log('- Последнее обновление:', config.lastUpdated || 'Не задано');

  // Создаем сервис
  const csmoneyService = new CSMoneyService(config);

  try {
    // Инициализация и проверка авторизации
    console.log('\nПроверка авторизации...');
    await csmoneyService.initialize();

    if (csmoneyService.isLoggedIn) {
      console.log('\x1b[32m%s\x1b[0m', '✓ Авторизация успешна!');

      // Проверка баланса
      console.log('\nПроверка баланса...');
      const balanceResult = await csmoneyService.getBalance();

      if (balanceResult.success) {
        console.log('\x1b[32m%s\x1b[0m', `✓ Баланс получен: ${balanceResult.balance}`);
      } else {
        console.log('\x1b[31m%s\x1b[0m', `✗ Ошибка получения баланса: ${balanceResult.message}`);
      }

      // Проверка получения списка предметов
      console.log('\nПроверка получения списка предметов...');
      const itemsResult = await csmoneyService.getItems(0, 5);

      if (itemsResult.success && itemsResult.items.length > 0) {
        console.log('\x1b[32m%s\x1b[0m', `✓ Успешно получено ${itemsResult.items.length} предметов`);
        console.log('Пример первого предмета:');
        console.log(JSON.stringify(itemsResult.items[0], null, 2));
      } else {
        console.log('\x1b[31m%s\x1b[0m', `✗ Ошибка получения предметов: ${itemsResult.message || 'Нет доступных предметов'}`);
      }

      // Проверка поиска предмета
      console.log('\nПроверка поиска предмета (AK-47 | Redline)...');
      const searchResult = await csmoneyService.searchItem('AK-47 | Redline', 'Field-Tested');

      if (searchResult.success) {
        console.log('\x1b[32m%s\x1b[0m', `✓ Предмет найден: ${searchResult.market_hash_name}`);
        console.log(`Доступно предложений: ${searchResult.items.length}`);
        if (searchResult.items.length > 0) {
          console.log(`Минимальная цена: ${searchResult.items[0].price}`);
        }
      } else {
        console.log('\x1b[31m%s\x1b[0m', `✗ Ошибка поиска предмета: ${searchResult.message}`);
      }

    } else {
      console.log('\x1b[31m%s\x1b[0m', '✗ Авторизация не удалась');
      console.log('Проверьте правильность cookies в конфигурации');

      // Попробуем получить предметы без авторизации (часть API может работать)
      console.log('\nПопытка получить предметы без авторизации...');
      const itemsResult = await csmoneyService.getItems(0, 5);

      if (itemsResult.success && itemsResult.items.length > 0) {
        console.log('\x1b[32m%s\x1b[0m', `✓ Предметы доступны без авторизации (${itemsResult.items.length} шт.)`);
        console.log('Для полной функциональности рекомендуется настроить авторизацию');
      } else {
        console.log('\x1b[31m%s\x1b[0m', '✗ Не удалось получить предметы без авторизации');
      }
    }

    // Проверка соединения по API
    console.log('\nПроверка прямого запроса к API...');
    try {
      const response = await csmoneyService.axiosInstance.get('/2.0/market/sell-orders?limit=1&offset=0');

      if (response.data && Array.isArray(response.data.items)) {
        console.log('\x1b[32m%s\x1b[0m', '✓ API доступно, получен корректный ответ');
      } else {
        console.log('\x1b[31m%s\x1b[0m', '✗ API вернуло неожиданный формат данных');
        console.log(response.data);
      }
    } catch (apiError) {
      console.log('\x1b[31m%s\x1b[0m', '✗ Ошибка при обращении к API');
      console.log(apiError.message);
    }

  } catch (error) {
    console.log('\x1b[31m%s\x1b[0m', '✗ Ошибка при тестировании:');
    console.log(error);
  } finally {
    // Закрываем сервис
    await csmoneyService.close();
    console.log('\nТестирование завершено.');
  }
}

// Запускаем тест
testCSMoneyConfig().catch(error => {
  console.error('Необработанная ошибка:', error);
  process.exit(1);
});
