#!/usr/bin/env node

/**
 * Скрипт для настройки конфигурации BUFF
 * Позволяет указать cookies для авторизации на BUFF
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const winston = require('winston');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/setup-buff.log')
    })
  ],
});

// Создаем интерфейс для чтения ввода пользователя
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Путь к файлу конфигурации
const configPath = path.join(__dirname, '../config/buff_config.json');

// Проверяем существование директории для конфигурации
const configDir = path.dirname(configPath);
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// Читаем текущую конфигурацию, если она существует
let currentConfig = {};
if (fs.existsSync(configPath)) {
  try {
    currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    logger.info('Текущая конфигурация BUFF загружена');
  } catch (error) {
    logger.error('Ошибка при чтении текущей конфигурации BUFF:', error);
    currentConfig = {};
  }
}

// Функция для запроса cookies у пользователя
function promptForCookies() {
  console.log('\n=== Настройка конфигурации BUFF ===');
  console.log('Для работы с BUFF необходимо предоставить cookies для авторизации.');
  console.log('Инструкция по получению cookies:');
  console.log('1. Войдите в свой аккаунт на buff.163.com в браузере');
  console.log('2. Откройте DevTools (F12 или правый клик -> Инспектировать)');
  console.log('3. Перейдите во вкладку "Network"');
  console.log('4. Обновите страницу (F5)');
  console.log('5. Выберите любой запрос к buff.163.com');
  console.log('6. В заголовках запроса найдите раздел "Cookie"');
  console.log('7. Скопируйте полное значение Cookie и вставьте ниже');
  console.log('\nВведите cookies для BUFF (начинается с "Puser_id=..." или "Device-Id=..."):\n');

  rl.question('> ', (cookies) => {
    if (!cookies) {
      console.log('Cookies не указаны. Настройка отменена.');
      rl.close();
      return;
    }

    // Сохраняем новую конфигурацию
    const newConfig = {
      ...currentConfig,
      cookies: cookies.trim(),
      lastUpdated: new Date().toISOString()
    };

    try {
      fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
      logger.info('Конфигурация BUFF успешно сохранена');
      console.log('\nКонфигурация BUFF успешно сохранена в ' + configPath);

      // Запрашиваем CSRF-токен (при наличии)
      promptForCsrfToken(newConfig);
    } catch (error) {
      logger.error('Ошибка при сохранении конфигурации BUFF:', error);
      console.log('\nОшибка при сохранении конфигурации:', error.message);
      rl.close();
    }
  });
}

// Функция для запроса CSRF-токена (опционально)
function promptForCsrfToken(config) {
  console.log('\nДля полноценной работы с BUFF может потребоваться CSRF-токен.');
  console.log('Его можно найти в исходном коде страницы buff.163.com в метатеге с именем "csrf_token".');
  console.log('Этот шаг опциональный, вы можете пропустить его, нажав Enter.');

  rl.question('Введите CSRF-токен (или нажмите Enter, чтобы пропустить): ', (csrfToken) => {
    if (csrfToken) {
      config.csrfToken = csrfToken.trim();

      try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        logger.info('CSRF-токен успешно сохранен');
        console.log('CSRF-токен успешно сохранен');
      } catch (error) {
        logger.error('Ошибка при сохранении CSRF-токена:', error);
        console.log('Ошибка при сохранении CSRF-токена:', error.message);
      }
    }

    console.log('\nНастройка BUFF завершена!');
    rl.close();
  });
}

// Запускаем настройку
promptForCookies();

// Обработка закрытия интерфейса ввода
rl.on('close', () => {
  console.log('\nПроцесс настройки BUFF завершен');
  process.exit(0);
});
