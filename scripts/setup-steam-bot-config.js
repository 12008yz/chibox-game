#!/usr/bin/env node

/**
 * Скрипт для безопасной настройки конфигурации Steam-бота
 * Запускается командой: node scripts/setup-steam-bot-config.js
 *
 * Параметры запуска:
 * --account=USERNAME    - Имя аккаунта Steam
 * --password=PASSWORD   - Пароль аккаунта Steam
 * --shared=SECRET       - Shared Secret для генерации 2FA кодов
 * --identity=SECRET     - Identity Secret для подтверждения трейдов
 * --file=PATH           - Путь к файлу конфигурации (JSON формат)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const winston = require('winston');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'steam-bot-config.log' }),
  ],
});

// Путь к файлу конфигурации
const configPath = path.join(__dirname, '../config/steam_bot.js');
const encryptedConfigPath = path.join(__dirname, '../config/steam_bot_encrypted.json');

// Проверяем существование директории для логов
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Функция для шифрования данных
function encryptData(data, key) {
  try {
    // Создаем хеш ключа для надежности
    const hash = crypto.createHash('sha256');
    hash.update(key || 'default_key');
    const keyBuffer = hash.digest();

    // Генерируем IV для GCM (12 байт рекомендуется для GCM)
    const iv = crypto.randomBytes(12);

    // Создаем шифр AES-256-GCM (обеспечивает целостность и аутентификацию)
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);

    // Шифруем данные
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Получаем тег аутентификации
    const authTag = cipher.getAuthTag();

    // Возвращаем IV, тег аутентификации и зашифрованные данные
    return {
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      data: encrypted
    };
  } catch (error) {
    logger.error('Ошибка при шифровании данных:', error);
    return null;
  }
}

// Функция для проверки валидности Shared Secret
function validateSharedSecret(secret) {
  // Shared Secret обычно представляет собой строку в формате base64
  // и заканчивается на "="
  if (!secret || typeof secret !== 'string') return false;

  // Проверка на валидный base64
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  return base64Regex.test(secret);
}

// Функция для проверки валидности Identity Secret
function validateIdentitySecret(secret) {
  // Аналогично Shared Secret, Identity Secret тоже в формате base64
  if (!secret || typeof secret !== 'string') return false;

  // Проверка на валидный base64
  const base64Regex = /^[A-Za-z0-9+/=]+$/;
  return base64Regex.test(secret);
}

// Парсинг аргументов командной строки
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const config = {
    accountName: '',
    password: '',
    sharedSecret: '',
    identitySecret: '',
    configFile: ''
  };

  args.forEach(arg => {
    if (arg.startsWith('--account=')) {
      config.accountName = arg.substring('--account='.length);
    } else if (arg.startsWith('--password=')) {
      config.password = arg.substring('--password='.length);
    } else if (arg.startsWith('--shared=')) {
      config.sharedSecret = arg.substring('--shared='.length);
    } else if (arg.startsWith('--identity=')) {
      config.identitySecret = arg.substring('--identity='.length);
    } else if (arg.startsWith('--file=')) {
      config.configFile = arg.substring('--file='.length);
    }
  });

  return config;
}

// Функция для загрузки конфигурации из файла
function loadConfigFromFile(filePath) {
  try {
    // Защита от Path Traversal - нормализуем путь и проверяем, что он находится в разрешенной директории
    const normalizedPath = path.normalize(filePath);
    const allowedDir = path.resolve(__dirname, '..');
    const resolvedPath = path.resolve(normalizedPath);

    // Проверяем, что файл находится в разрешенной директории
    if (!resolvedPath.startsWith(allowedDir)) {
      logger.error(`Попытка доступа к файлу вне разрешенной директории: ${filePath}`);
      return null;
    }

    // Проверяем расширение файла
    const allowedExtensions = ['.json', '.js'];
    const fileExt = path.extname(resolvedPath);
    if (!allowedExtensions.includes(fileExt)) {
      logger.error(`Недопустимое расширение файла: ${fileExt}`);
      return null;
    }

    if (!fs.existsSync(resolvedPath)) {
      logger.error(`Файл не найден: ${resolvedPath}`);
      return null;
    }

    const fileContent = fs.readFileSync(resolvedPath, 'utf8');
    const config = JSON.parse(fileContent);

    // Проверяем наличие необходимых полей
    if (!config.accountName || !config.password || !config.sharedSecret || !config.identitySecret) {
      logger.warn('В файле отсутствуют обязательные поля конфигурации');
    }

    return config;
  } catch (error) {
    logger.error(`Ошибка при загрузке конфигурации из файла ${filePath}:`, error);
    return null;
  }
}

// Интерактивный ввод данных с консоли
function promptForConfig() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n=== Настройка конфигурации Steam-бота ===');
    console.log('Будьте осторожны при вводе чувствительных данных!');

    const config = {
      accountName: '',
      password: '',
      sharedSecret: '',
      identitySecret: ''
    };

    rl.question('Введите имя аккаунта Steam: ', (accountName) => {
      config.accountName = accountName.trim();

      rl.question('Введите пароль аккаунта Steam: ', (password) => {
        config.password = password.trim();

        rl.question('Введите Shared Secret (для 2FA): ', (sharedSecret) => {
          config.sharedSecret = sharedSecret.trim();

          if (!validateSharedSecret(config.sharedSecret)) {
            console.log('\nПредупреждение: Введенный Shared Secret имеет некорректный формат. Продолжаем настройку...');
          }

          rl.question('Введите Identity Secret (для подтверждения трейдов): ', (identitySecret) => {
            config.identitySecret = identitySecret.trim();

            if (!validateIdentitySecret(config.identitySecret)) {
              console.log('\nПредупреждение: Введенный Identity Secret имеет некорректный формат. Продолжаем настройку...');
            }

            rl.close();
            resolve(config);
          });
        });
      });
    });
  });
}

// Сохранение конфигурации
function saveConfig(config) {
  try {
    // Создаем текст для JavaScript файла
    const configContent = `module.exports = {
  accountName: '${config.accountName}',
  password: '${config.password}',
  sharedSecret: '${config.sharedSecret}',
  identitySecret: '${config.identitySecret}'
};
`;

    // Сохраняем в файл
    fs.writeFileSync(configPath, configContent);
    logger.info('Конфигурация Steam-бота успешно сохранена');
    console.log(`\nКонфигурация сохранена в файл ${configPath}`);

    // Создаем зашифрованную копию для дополнительной безопасности
    const encryptedConfig = encryptData(config, 'your_secret_key_here');
    if (encryptedConfig) {
      fs.writeFileSync(encryptedConfigPath, JSON.stringify(encryptedConfig, null, 2));
      logger.info(`Создана зашифрованная копия конфигурации: ${encryptedConfigPath}`);
    }

    return true;
  } catch (error) {
    logger.error('Ошибка при сохранении конфигурации:', error);
    console.error('Ошибка при сохранении конфигурации:', error.message);
    return false;
  }
}

// Проверка конфигурации
async function testSteamBotConfig() {
  console.log('\nПроверка конфигурации Steam-бота...');

  try {
    // Проверяем существование файла конфигурации
    if (!fs.existsSync(configPath)) {
      console.log('❌ Файл конфигурации не найден.');
      return false;
    }

    // Загружаем конфигурацию
    const config = require(configPath);

    // Проверяем наличие всех необходимых полей
    if (!config.accountName || !config.password || !config.sharedSecret || !config.identitySecret) {
      console.log('❌ В конфигурации отсутствуют обязательные поля.');
      return false;
    }

    console.log('✓ Файл конфигурации прошел базовую проверку.');

    // Проверка форматов секретов
    if (!validateSharedSecret(config.sharedSecret)) {
      console.log('⚠️ Shared Secret имеет некорректный формат.');
    } else {
      console.log('✓ Shared Secret имеет корректный формат.');
    }

    if (!validateIdentitySecret(config.identitySecret)) {
      console.log('⚠️ Identity Secret имеет некорректный формат.');
    } else {
      console.log('✓ Identity Secret имеет корректный формат.');
    }

    console.log('\nДля полной проверки конфигурации выполните:');
    console.log('node scripts/test-steam-bot.js');

    return true;
  } catch (error) {
    console.log('❌ Ошибка при проверке конфигурации:', error.message);
    return false;
  }
}

// Основная функция
async function main() {
  try {
    // Парсим аргументы командной строки
    const argsConfig = parseCommandLineArgs();

    // Определяем источник конфигурации
    let finalConfig;

    if (argsConfig.configFile) {
      // Загружаем из файла
      console.log(`Загрузка конфигурации из файла: ${argsConfig.configFile}`);
      const fileConfig = loadConfigFromFile(argsConfig.configFile);

      if (fileConfig) {
        finalConfig = fileConfig;
      } else {
        console.log('Не удалось загрузить конфигурацию из файла. Переключаемся на интерактивный режим...');
        finalConfig = await promptForConfig();
      }
    } else if (argsConfig.accountName && argsConfig.password && argsConfig.sharedSecret && argsConfig.identitySecret) {
      // Используем аргументы командной строки
      console.log('Использование конфигурации из аргументов командной строки');
      finalConfig = argsConfig;
    } else {
      // Используем интерактивный ввод
      finalConfig = await promptForConfig();
    }

    // Сохраняем конфигурацию
    if (saveConfig(finalConfig)) {
      console.log('✓ Конфигурация Steam-бота успешно сохранена.');

      // Проверяем сохраненную конфигурацию
      await testSteamBotConfig();
    } else {
      console.log('❌ Не удалось сохранить конфигурацию Steam-бота.');
    }
  } catch (error) {
    logger.error('Необработанная ошибка:', error);
    console.error('Произошла ошибка:', error.message);
  }
}

// Запускаем основную функцию
main();
