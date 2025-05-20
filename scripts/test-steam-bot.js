#!/usr/bin/env node

/**
 * Скрипт для тестирования функциональности Steam-бота
 * Запускается командой: node scripts/test-steam-bot.js [--full]
 *
 * Опции:
 * --full - запускает полный набор тестов, включая попытку авторизации
 * --inventory - проверяет только инвентарь
 */

const SteamBot = require('../services/steamBotService');
const steamBotConfig = require('../config/steam_bot');
const winston = require('winston');
const path = require('path');
const fs = require('fs');
const SteamTotp = require('steam-totp');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/test-steam-bot.log')
    })
  ],
});

// Убеждаемся, что директория для логов существует
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Разбор аргументов командной строки
function parseArguments() {
  const args = process.argv.slice(2);
  return {
    fullTest: args.includes('--full'),
    inventoryOnly: args.includes('--inventory')
  };
}

// Функция для тестирования генерации 2FA кода
async function testTwoFactorAuth() {
  try {
    console.log('\n=== Тестирование генерации кода 2FA ===');

    if (!steamBotConfig.sharedSecret) {
      console.log('❌ Shared Secret отсутствует в конфигурации.');
      return false;
    }

    const code = SteamTotp.generateAuthCode(steamBotConfig.sharedSecret);
    console.log(`✓ 2FA код успешно сгенерирован: ${code}`);

    return true;
  } catch (error) {
    console.log('❌ Ошибка при генерации 2FA кода:', error.message);
    logger.error('Ошибка при генерации 2FA кода:', error);
    return false;
  }
}

// Тестирование инициализации и авторизации бота
async function testBotLogin() {
  try {
    console.log('\n=== Тестирование авторизации в Steam ===');
    console.log('Инициализация Steam-бота...');

    // Проверка конфигурации
    if (!steamBotConfig.accountName || !steamBotConfig.password ||
        !steamBotConfig.sharedSecret || !steamBotConfig.identitySecret) {
      console.log('❌ Неполная конфигурация Steam-бота. Проверьте наличие всех необходимых полей.');
      return false;
    }

    // Создаем экземпляр бота
    const bot = new SteamBot(
      steamBotConfig.accountName,
      steamBotConfig.password,
      steamBotConfig.sharedSecret,
      steamBotConfig.identitySecret
    );

    // Попытка авторизации
    console.log('Попытка авторизации в Steam...');
    console.log('(Этот процесс может занять до 30 секунд)');

    await bot.login();

    if (bot.loggedIn) {
      console.log('✓ Успешная авторизация в Steam!');

      // Проверка инвентаря
      console.log('\nЗагрузка инвентаря CS2...');
      const inventory = await bot.getInventory(730, 2);

      if (inventory && Array.isArray(inventory)) {
        console.log(`✓ Инвентарь успешно загружен (${inventory.length} предметов)`);

        // Показываем первые 5 предметов для примера
        if (inventory.length > 0) {
          console.log('\nПримеры предметов в инвентаре:');
          inventory.slice(0, 5).forEach((item, index) => {
            console.log(`${index + 1}. ${item.market_hash_name || 'Неизвестный предмет'} (${item.assetid})`);
          });
        } else {
          console.log('Инвентарь пуст.');
        }
      } else {
        console.log('❌ Ошибка загрузки инвентаря.');
      }

      // Закрываем соединение
      console.log('\nЗавершение сессии...');
      await bot.shutdown();
      console.log('✓ Сессия завершена');

      return true;
    } else {
      console.log('❌ Не удалось авторизоваться в Steam. Проверьте учетные данные и 2FA настройки.');
      return false;
    }
  } catch (error) {
    console.log('❌ Ошибка при тестировании бота:', error.message);
    logger.error('Ошибка при тестировании бота:', error);
    return false;
  }
}

// Тестирование только инвентаря (без полной авторизации)
async function testInventoryOnly() {
  try {
    console.log('\n=== Тестирование доступа к инвентарю ===');

    // Создаем экземпляр бота
    const bot = new SteamBot(
      steamBotConfig.accountName,
      steamBotConfig.password,
      steamBotConfig.sharedSecret,
      steamBotConfig.identitySecret
    );

    // Инициализируем бота
    await bot.initialize();

    // Проверка инвентаря
    console.log('Загрузка инвентаря CS2...');
    const inventory = await bot.getInventory(730, 2);

    if (inventory && Array.isArray(inventory)) {
      console.log(`✓ Инвентарь успешно загружен (${inventory.length} предметов)`);

      // Показываем первые 5 предметов для примера
      if (inventory.length > 0) {
        console.log('\nПримеры предметов в инвентаре:');
        inventory.slice(0, 5).forEach((item, index) => {
          console.log(`${index + 1}. ${item.market_hash_name || 'Неизвестный предмет'} (${item.assetid})`);
        });
      } else {
        console.log('Инвентарь пуст.');
      }

      // Закрываем соединение
      await bot.shutdown();
      return true;
    } else {
      console.log('❌ Ошибка загрузки инвентаря.');
      return false;
    }
  } catch (error) {
    console.log('❌ Ошибка при тестировании инвентаря:', error.message);
    logger.error('Ошибка при тестировании инвентаря:', error);
    return false;
  }
}

// Основная функция
async function main() {
  try {
    // Получаем аргументы командной строки
    const args = parseArguments();

    console.log('=== Тестирование Steam-бота ===');
    console.log(`Аккаунт: ${steamBotConfig.accountName}`);

    // Маскируем пароль для безопасности
    if (steamBotConfig.password) {
      const maskedPassword = '*'.repeat(steamBotConfig.password.length);
      console.log(`Пароль: ${maskedPassword}`);
    } else {
      console.log('Пароль: Не указан');
    }

    console.log(`Shared Secret: ${steamBotConfig.sharedSecret ? '✓ Указан' : '❌ Отсутствует'}`);
    console.log(`Identity Secret: ${steamBotConfig.identitySecret ? '✓ Указан' : '❌ Отсутствует'}`);

    // Тестирование 2FA
    const authTest = await testTwoFactorAuth();

    if (!authTest) {
      console.log('\n⚠️ Тест генерации 2FA кода не пройден. Проверьте настройки Shared Secret.');
    }

    // Тестирование авторизации и инвентаря
    if (args.fullTest) {
      await testBotLogin();
    } else if (args.inventoryOnly) {
      await testInventoryOnly();
    } else {
      console.log('\nДля полного тестирования авторизации добавьте параметр --full');
      console.log('Например: node scripts/test-steam-bot.js --full');
      console.log('\nДля тестирования только инвентаря добавьте параметр --inventory');
      console.log('Например: node scripts/test-steam-bot.js --inventory');
    }

    console.log('\nТестирование завершено.');
  } catch (error) {
    console.log('Необработанная ошибка:', error.message);
    logger.error('Необработанная ошибка:', error);
  }
}

// Запускаем тест
main().catch(err => {
  console.error('Критическая ошибка:', err);
  process.exit(1);
}).finally(() => {
  // Даем время логгеру завершить запись
  setTimeout(() => process.exit(0), 1000);
});
