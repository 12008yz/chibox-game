#!/usr/bin/env node

/**
 * Скрипт для тестирования конфигурации LIS-Skins
 * Запускается командой: node scripts/test-lis-config.js
 */

const LisService = require('../services/lisService');
const winston = require('winston');
const path = require('path');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'test-lis-config.log' }),
  ],
});

async function testLisConfig() {
  logger.info('Начало тестирования конфигурации LIS-Skins...');
  console.log('\n=== Тестирование конфигурации LIS-Skins ===');

  try {
    // Обновленные данные конфигурации
    const config = {
      cookies: "cf_clearance=Ci5NzoY66Fs4hf3JOvPcrsyDZfntVakNIOwGumqE2TA-1747753679-1.2.1.1-k3nadJSUKGy3SVwH736IovvNScs0xyxcClklC_dhOdFsCnO5R8d.CBKBj1HBDzFvOcgjmaFDbhI4VrJw2DrBzORCZFMbw.hNoktsuG86MqBXJvmh28VBzxzF.Vip65K9F3sjHcgqz3Py3wq5cTTGTGgvFyThCwjgzzuOuQzfdIt0Sp8TMJpMNySsGrTgTzg3seFckJwrgYJ_Aerk47yvSg7lFj..o6NRf1VtrF.ovlClpGr0Sw9Dtr.yKLG34HXjR2FnxT5s6yVsoZbd4NZXonP0Mj_zMDPl8RfYEW_Aty06cTHhZR.HFG3EAQd2c2hKw3Dg1sPazX.SAr.NewxLVM1i3qzjhFb0u_FIBjHITEw; firstLogin=20250520; lis_skins_session=eyJpdiI6ImxHL2Z2aU13bGNlSW9Mdm9OZGdISUE9PSIsInZhbHVlIjoiaSsyNE4yWjFLa3pCeU5CeDVjaXhuSU1mUEZWVllaU3Y5Q3FrSzJTNGdSVFZTY1VwV1ZwK29VOG10Z0xhYVBYOFIrUzIrSmVjalc0UTNvWkYwcXFmMjZqNmVxdGJvdkF3Mm15QWZEdnhod0txc1NjTlYzTjBZMmVCMktLbVpEM2UiLCJtYWMiOiI0NDM5NWUyMzk0NGUyYjQ5OWJkNGU1NGMyNTIzZjY5NTUzOWZlYmEwNzI1MjlkZTg1ODEyMmQ2OTRmNjM2ODI3IiwidGFnIjoiIn0%3D; lsuserid=3361403; remember_web_59ba36addc2b2f9401580f014c7f58ea4e30989d=eyJpdiI6InFGOGNkbm1QMzdIN2UzY0ZEdldVM1E9PSIsInZhbHVlIjoiK1FxQUFxN2svRzdtQ0JpcVE3Y29zeVo5czRDN0k5bmJoTE95ZlJrTXpzalNRTjVCOG5FOW80VGlhenFQWEtzZUlJbmVjL0lzK0VpS0hDemdHVzRxeGF4U1lMNkdubkcvM2NHRW1TQmtOUXEwMEM5S1BPMFk2L3JoTGFEbWJFb0IweWE0Z2dDdE40VDBBYXRjY256TjJnPT0iLCJtYWMiOiI0MmFlODU2YWFkMmEzMjM1YzA4NmVkODQwMjRmOTRiMjdhNDM2NjhiN2EzMDdiNjQwM2RmN2MwNWY4NjVhM2JhIiwidGFnIjoiIn0%3D",
      csrfToken: "eyJpdiI6ImxzTm9tL1lKYWpxSnUvWndOVWZoRXc9PSIsInZhbHVlIjoiQzVXOENzVlVNRXRzNUt5eC9xZDhDS29VeU9IQlpwN2xjSWh0bUQ1MlVjb1N1K0dmZ3pGNDA2WjlNNUt4TjRlTkg5RVN4TDU3djhCNFpUR1dTeThoWVlvMTJoLzBJNkNMSzdpSmRYZ0NZZmlaTjNjQ094YXcwYUxFK1dFaUYwME8iLCJtYWMiOiI5YmMwMjE1MGIzZWM2YzFkY2I5YmRhODQ1NzNjYWQ2NmI2NjZjZTJlNmM4NTg0ZGU5ZTA4MzM3NDc5Y2RjZDQ3IiwidGFnIjoiIn0%3D",
      sessionId: "3:1747422678.5.0.1701599635525:ZoWLXw:4a.1.2:1|1666232928.0.2.3:1701599635|269164980.4950206.2.2:4950206.3:1706549841|3:10307563.479913.sCRNcZo63XnbH1FuRttVmt7iItI",
      apiKey: ""
    };

    if (!config || !config.cookies) {
      logger.error('Ошибка: Конфигурация LIS-Skins отсутствует или неполная');
      console.log('❌ Ошибка: Конфигурация LIS-Skins отсутствует или неполная');
      console.log('Выполните настройку: node scripts/setup-lis-config.js');
      return false;
    }

    logger.info('Конфигурация загружена успешно');
    console.log('✓ Конфигурация загружена успешно');

    // Создаем экземпляр сервиса
    const lisService = new LisService(config);

    // Инициализируем сервис и проверяем авторизацию
    console.log('\nТестирование авторизации...');
    await lisService.initialize();

    if (lisService.isLoggedIn) {
      logger.info('Авторизация на LIS-Skins прошла успешно!');
      console.log('✓ Авторизация на LIS-Skins прошла успешно!');


      console.log('\nПроверка получения инвентаря...');
      const inventory = await lisService.getLisInventory();

      if (inventory.success) {
        logger.info(`Инвентарь LIS-Skins содержит ${inventory.items.length} предметов`);
        console.log(`✓ Инвентарь LIS-Skins содержит ${inventory.items.length} предметов`);
      } else {
        logger.warn(`Получение инвентаря не удалось: ${inventory.message}`);
        console.log(`⚠️ Получение инвентаря не удалось: ${inventory.message}`);
      }

      console.log('\nТестовый поиск предмета...');
      const testItem = await lisService.searchItem('AK-47 | Redline', 'Field-Tested');

      if (testItem) {
        logger.info(`Тестовый предмет найден: ${testItem.market_hash_name}, цена: ${testItem.min_price}`);
        console.log(`✓ Тестовый предмет найден: ${testItem.market_hash_name}, цена: ${testItem.min_price}`);
      } else {
        logger.warn('Тестовый предмет не найден');
        console.log('⚠️ Тестовый предмет не найден. Это может быть нормально, если такого предмета нет в продаже.');
      }

      console.log('\n✅ Все тесты пройдены успешно, конфигурация LIS-Skins работает корректно!');
    } else {
      logger.error('Ошибка авторизации на LIS-Skins. Проверьте cookies в конфигурации.');
      console.log('❌ Ошибка авторизации на LIS-Skins. Проверьте cookies в конфигурации.');
      console.log('Выполните повторную настройку: node scripts/setup-lis-config.js с актуальными cookies');
      return false;
    }

    // Закрываем сервис после использования
    await lisService.close();
    return true;
  } catch (error) {
    logger.error('Ошибка при тестировании конфигурации LIS-Skins:', error);
    console.log('❌ Ошибка при тестировании конфигурации LIS-Skins:');
    console.log(error.message);
    return false;
  }
}

// Если скрипт запускается напрямую
if (require.main === module) {
  testLisConfig().then(success => {
    if (success) {
      console.log('\nДля импорта предметов с LIS-Skins запустите:');
      console.log('node scripts/import-lis-items-improved.js');
    } else {
      console.log('\nИсправьте ошибки конфигурации перед продолжением.');
    }

    // Даем время логгеру завершить запись
    setTimeout(() => process.exit(success ? 0 : 1), 1000);
  });
} else {
  // Экспортируем функцию для использования в других модулях
  module.exports = testLisConfig;
}
