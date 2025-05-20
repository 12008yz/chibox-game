#!/usr/bin/env node

/**
 * Улучшенный скрипт для настройки конфигурации LIS-Skins
 * Запускается командой: node scripts/setup-lis-config.js "cookie_string" "csrf_token"
 *
 * Для безопасного запуска можно использовать файл с конфигурацией:
 * node scripts/setup-lis-config.js --file /path/to/config.json
 *
 * Формат JSON-файла конфигурации:
 * {
 *   "cookies": "ваши_куки",
 *   "csrfToken": "ваш_csrf_токен",
 *   "sessionId": "ваш_session_id",
 *   "apiKey": "ваш_api_key"
 * }
 */

const fs = require('fs');
const path = require('path');
const winston = require('winston');
const crypto = require('crypto');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'lis-config-setup.log' }),
  ],
});

// Путь к файлу конфигурации
const configPath = path.join(__dirname, '../config/lis_config.json');

// Функция для проверки валидности cookies
function validateCookies(cookies) {
  if (!cookies || typeof cookies !== 'string') return false;

  // Простая проверка формата cookie
  const cookiePattern = /[a-zA-Z0-9_]+=.+?;/;
  return cookiePattern.test(cookies);
}

// Функция для проверки валидности CSRF-токена
function validateCsrfToken(token) {
  if (!token || typeof token !== 'string') return false;
  return token.length > 20; // Обычно CSRF-токены длинные
}

// Простое шифрование для добавления уровня безопасности
function encryptData(data, key) {
  try {
    // Создаем хеш ключа для надежности
    const hash = crypto.createHash('sha256');
    hash.update(key || 'default_key');
    const keyBuffer = hash.digest();

    // Генерируем IV
    const iv = crypto.randomBytes(16);

    // Создаем шифр
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);

    // Шифруем данные
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Возвращаем IV и зашифрованные данные
    return {
      iv: iv.toString('hex'),
      data: encrypted
    };
  } catch (error) {
    logger.error('Ошибка при шифровании данных:', error);
    return null;
  }
}

// Конфигурация
let config = {
  cookies: '',
  csrfToken: '',
  sessionId: '',
  apiKey: '',
  lastUpdated: new Date().toISOString()
};

// Разбор аргументов командной строки
if (process.argv.includes('--file')) {
  const fileIndex = process.argv.indexOf('--file');
  if (fileIndex + 1 < process.argv.length) {
    const configFilePath = process.argv[fileIndex + 1];
    try {
      logger.info(`Загрузка конфигурации из файла: ${configFilePath}`);
      const fileContent = fs.readFileSync(configFilePath, 'utf8');
      const fileConfig = JSON.parse(fileContent);

      // Применяем конфигурацию из файла
      config = {
        ...config,
        ...fileConfig,
        lastUpdated: new Date().toISOString()
      };

      logger.info('Конфигурация успешно загружена из файла');
    } catch (error) {
      logger.error(`Ошибка при загрузке конфигурации из файла ${configFilePath}:`, error);
      console.error('Ошибка при загрузке конфигурации из файла:', error.message);
      process.exit(1);
    }
  } else {
    logger.error('Не указан путь к файлу конфигурации после аргумента --file');
    console.error('Не указан путь к файлу конфигурации после аргумента --file');
    process.exit(1);
  }
} else {
  // Получение данных из аргументов командной строки
  config.cookies = process.argv[2] || '';
  config.csrfToken = process.argv[3] || '';
  config.sessionId = process.argv[4] || '';
  config.apiKey = process.argv[5] || '';
}

// Проверка валидности cookies
if (!validateCookies(config.cookies)) {
  logger.warn('Предупреждение: Cookie-строка отсутствует или имеет некорректный формат');
  console.warn('Предупреждение: Cookie-строка отсутствует или имеет некорректный формат');
}

// Проверка валидности CSRF-токена
if (!validateCsrfToken(config.csrfToken)) {
  logger.warn('Предупреждение: CSRF-токен отсутствует или имеет некорректный формат');
  console.warn('Предупреждение: CSRF-токен отсутствует или имеет некорректный формат');
}

// Проверка на наличие обязательных полей
if (!config.cookies) {
  logger.error('Необходимо указать cookie строку');
  console.log('Использование: node scripts/setup-lis-config.js "cookie_string" "csrf_token" "session_id" "api_key"');
  console.log('Или: node scripts/setup-lis-config.js --file /path/to/config.json');
  process.exit(1);
}

try {
  // Сохраняем конфигурацию в файл
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  logger.info('Конфигурация LIS-Skins успешно сохранена');
  console.log(`Конфигурация сохранена в файл ${configPath}`);

  // Создаем зашифрованную резервную копию (опционально)
  const encryptedConfig = encryptData(JSON.stringify(config), 'your_secret_key_here');
  if (encryptedConfig) {
    const backupPath = path.join(__dirname, '../config/lis_config.backup.json');
    fs.writeFileSync(backupPath, JSON.stringify(encryptedConfig, null, 2));
    logger.info(`Создана зашифрованная резервная копия конфигурации: ${backupPath}`);
  }

  // Проверка конфигурации
  console.log('\nДля проверки конфигурации выполните:');
  console.log('node scripts/test-lis-config.js');
} catch (error) {
  logger.error('Ошибка при сохранении конфигурации:', error);
  console.error('Ошибка при сохранении конфигурации:', error.message);
  process.exit(1);
}
