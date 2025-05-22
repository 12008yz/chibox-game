#!/usr/bin/env node

/**
 * Скрипт для настройки конфигурации CS.Money
 * Запускается командой: node scripts/setup-csmoney-config.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const CSMoneyService = require('../services/csmoneyService');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Путь к файлу конфигурации
const configPath = path.join(__dirname, '../config/csmoney_config.json');

// Функция для очистки куки-строки от лишних символов
function sanitizeCookieString(cookieString) {
  return cookieString.trim();
}

// Проверяем существование файла конфигурации
let currentConfig = {};
try {
  if (fs.existsSync(configPath)) {
    currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('Текущая конфигурация CS.Money:');
    console.log('- Cookies установлены:', !!currentConfig.cookies);
    console.log('- CSRF-Token установлен:', !!currentConfig.csrfToken);
    console.log('- Session ID установлен:', !!currentConfig.sessionId);
    console.log('- Последнее обновление:', currentConfig.lastUpdated || 'Не задано');
  } else {
    console.log('Файл конфигурации CS.Money не найден. Будет создан новый файл.');
  }
} catch (err) {
  console.log('Ошибка при чтении файла конфигурации:', err.message);
  console.log('Будет создан новый файл конфигурации.');
}

// Функция для запроса данных у пользователя
async function promptUser() {
  console.log('\nДля настройки CS.Money вам необходимо:');
  console.log('1. Войти в свой аккаунт на https://cs.money/ru/market/buy/');
  console.log('2. Открыть DevTools (F12)');
  console.log('3. Перейти на вкладку Application > Cookies > cs.money');
  console.log('4. Скопировать значения необходимых cookie');

  return new Promise((resolve) => {
    rl.question('\nВведите строку cookies из браузера (или нажмите Enter для пропуска): ', (cookies) => {
      const cookieValue = cookies.trim() ? sanitizeCookieString(cookies) : currentConfig.cookies || '';

      rl.question('Введите CSRF-токен (или нажмите Enter для пропуска): ', (csrfToken) => {
        const csrfValue = csrfToken.trim() ? csrfToken.trim() : currentConfig.csrfToken || '';

        rl.question('Введите Session ID (или нажмите Enter для пропуска): ', (sessionId) => {
          const sessionValue = sessionId.trim() ? sessionId.trim() : currentConfig.sessionId || '';

          resolve({
            cookies: cookieValue,
            csrfToken: csrfValue,
            sessionId: sessionValue,
            lastUpdated: new Date().toISOString()
          });
        });
      });
    });
  });
}

// Функция для сохранения конфигурации
function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log('Конфигурация CS.Money успешно сохранена в', configPath);
    return true;
  } catch (err) {
    console.error('Ошибка при сохранении конфигурации:', err.message);
    return false;
  }
}

// Функция для тестирования конфигурации
async function testConfig(config) {
  console.log('\nТестирование конфигурации CS.Money...');
  const csmoneyService = new CSMoneyService(config);

  try {
    await csmoneyService.initialize();

    if (csmoneyService.isLoggedIn) {
      console.log('\x1b[32m%s\x1b[0m', '✓ Успешно авторизован на CS.Money!');

      const balance = await csmoneyService.getBalance();
      if (balance.success) {
        console.log(`✓ Текущий баланс: ${balance.balance}`);
      } else {
        console.log('\x1b[33m%s\x1b[0m', '! Не удалось получить баланс, но авторизация выполнена.');
      }
    } else {
      console.log('\x1b[31m%s\x1b[0m', '✗ Не удалось авторизоваться на CS.Money.');
      console.log('Для автоматической покупки предметов необходима авторизация!');
      console.log('Проверьте правильность введенных cookies и CSRF-токена.');
    }

    // Тестируем получение предметов
    console.log('\nПроверка получения предметов с CS.Money...');
    const items = await csmoneyService.getItems(0, 10);

    if (items.success && items.items.length > 0) {
      console.log('\x1b[32m%s\x1b[0m', `✓ Успешно получено ${items.items.length} предметов!`);
      console.log('Пример первого предмета:');
      console.log(`- Название: ${items.items[0].name}`);
      console.log(`- Цена: ${items.items[0].price}`);
      console.log(`- ID: ${items.items[0].id}`);
    } else {
      console.log('\x1b[31m%s\x1b[0m', '✗ Не удалось получить предметы с CS.Money.');
      console.log('Ошибка:', items.message || 'Неизвестная ошибка');
    }

  } catch (error) {
    console.log('\x1b[31m%s\x1b[0m', '✗ Ошибка при тестировании конфигурации:');
    console.log(error.message);
    return false;
  } finally {
    await csmoneyService.close();
  }

  return csmoneyService.isLoggedIn;
}

// Основная функция
async function main() {
  console.log('=== Настройка конфигурации CS.Money ===');

  try {
    // Запрашиваем данные у пользователя
    const config = await promptUser();

    // Сохраняем конфигурацию
    if (saveConfig(config)) {
      // Тестируем конфигурацию
      const testResult = await testConfig(config);

      if (testResult) {
        console.log('\n\x1b[32m%s\x1b[0m', 'Конфигурация CS.Money успешно настроена и протестирована!');
        console.log('Теперь вы можете запустить импорт предметов командой:');
        console.log('  node scripts/import-csmoney-items.js');
      } else {
        console.log('\n\x1b[31m%s\x1b[0m', 'Конфигурация сохранена, но тест авторизации не пройден или авторизация не выполнена.');
        console.log('Проверьте правильность введенных данных и попробуйте снова, если требуется авторизация для покупок.');
      }
    }
  } catch (error) {
    console.log('\x1b[31m%s\x1b[0m', 'Ошибка при настройке конфигурации:');
    console.log(error.message);
  } finally {
    rl.close();
  }
}

// Запускаем основную функцию
main();
