/**
 * Модуль для безопасного хранения и загрузки конфиденциальных данных
 *
 * ВАЖНО: В производственной среде следует использовать переменные окружения
 * или менеджер секретов, а не хранить чувствительные данные в коде.
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
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/secrets.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
  ],
});

// Пути к файлам конфигурации
const csmoneyConfigPath = path.join(__dirname, './csmoney_config.json');
const steamBotConfigPath = path.join(__dirname, './steam_bot.js');
const encryptedConfigPath = path.join(__dirname, './encrypted_config.json');

// Проверяем, существует ли директория для логов
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Получение ключа шифрования из переменной окружения или дефолтного значения
 * В продакшене всегда следует использовать переменную окружения!
 */
function getEncryptionKey() {
if (!process.env.ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY environment variable must be set');
}
return process.env.ENCRYPTION_KEY;
}

/**
 * Функция для шифрования данных
 */
function encryptData(data, key = getEncryptionKey()) {
  try {
    // Создаем хеш ключа для надежности
    const hash = crypto.createHash('sha256');
    hash.update(key);
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

/**
 * Функция для дешифрования данных
 */
function decryptData(encryptedData, key = getEncryptionKey()) {
  try {
    // Проверяем наличие всех необходимых полей
    if (!encryptedData.iv || !encryptedData.authTag || !encryptedData.data) {
      throw new Error('Отсутствуют необходимые поля для дешифрования');
    }

    // Создаем хеш ключа
    const hash = crypto.createHash('sha256');
    hash.update(key);
    const keyBuffer = hash.digest();

    // Получаем IV и тег аутентификации из зашифрованных данных
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');

    // Создаем дешифр AES-256-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);

    // Дешифруем данные
    let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    logger.error('Ошибка при дешифровании данных:', error);
    return null;
  }
}

/**
 * Функция для безопасной загрузки конфигурации CS.Money
 */
function loadCSMoneyConfig() {
  try {
    if (fs.existsSync(csmoneyConfigPath)) {
      const config = JSON.parse(fs.readFileSync(csmoneyConfigPath, 'utf8'));

      // Проверка наличия необходимых полей
      if (!config.cookies || config.cookies.trim() === '') {
        logger.warn('В конфигурации CS.Money отсутствуют cookies');
      }

      return config;
    } else {
      logger.warn(`Файл конфигурации CS.Money не найден по пути: ${csmoneyConfigPath}`);
      return {
        cookies: '',
        csrfToken: '',
        sessionId: '',
        steamId: '',
        userAgent: '',
        lastUpdated: new Date().toISOString()
      };
    }
  } catch (error) {
    logger.error('Ошибка при загрузке конфигурации CS.Money:', error);
    return {
      cookies: '',
      csrfToken: '',
      sessionId: '',
      steamId: '',
      userAgent: '',
      lastUpdated: new Date().toISOString()
    };
  }
}

/**
 * Функция для безопасной загрузки конфигурации Steam-бота
 */
function loadSteamBotConfig() {
  try {
    if (fs.existsSync(steamBotConfigPath)) {
      // При использовании переменных окружения изменить на:
      // return {
      //   accountName: process.env.STEAM_ACCOUNT_NAME,
      //   password: process.env.STEAM_PASSWORD,
      //   sharedSecret: process.env.STEAM_SHARED_SECRET,
      //   identitySecret: process.env.STEAM_IDENTITY_SECRET
      // };

      // Загружаем конфигурацию из файла
      const config = require(steamBotConfigPath);

      // Проверка наличия необходимых полей
      if (!config.accountName || !config.password || !config.sharedSecret || !config.identitySecret) {
        logger.warn('В конфигурации Steam-бота отсутствуют обязательные поля');
      }

      return config;
    } else {
      logger.warn(`Файл конфигурации Steam-бота не найден по пути: ${steamBotConfigPath}`);
      return {
        accountName: '',
        password: '',
        sharedSecret: '',
        identitySecret: ''
      };
    }
  } catch (error) {
    logger.error('Ошибка при загрузке конфигурации Steam-бота:', error);
    return {
      accountName: '',
      password: '',
      sharedSecret: '',
      identitySecret: ''
    };
  }
}

/**
 * Сохранение зашифрованной конфигурации
 */
function saveEncryptedConfig(config) {
  try {
    const encryptedConfig = encryptData(config);
    fs.writeFileSync(encryptedConfigPath, JSON.stringify(encryptedConfig, null, 2));
    logger.info('Зашифрованная конфигурация успешно сохранена');
    return true;
  } catch (error) {
    logger.error('Ошибка при сохранении зашифрованной конфигурации:', error);
    return false;
  }
}

/**
 * Загрузка зашифрованной конфигурации
 */
function loadEncryptedConfig() {
  try {
    if (fs.existsSync(encryptedConfigPath)) {
      const encryptedConfig = JSON.parse(fs.readFileSync(encryptedConfigPath, 'utf8'));
      const config = decryptData(encryptedConfig);
      logger.info('Зашифрованная конфигурация успешно загружена');
      return config;
    } else {
      logger.warn('Файл с зашифрованной конфигурацией не найден');
      return null;
    }
  } catch (error) {
    logger.error('Ошибка при загрузке зашифрованной конфигурации:', error);
    return null;
  }
}

/**
 * Проверка на наличие необходимых конфигураций
 */
function checkConfigurations() {
  const csmoneyConfig = loadCSMoneyConfig();
  const steamBotConfig = loadSteamBotConfig();

  const issues = [];

  if (!csmoneyConfig.cookies || csmoneyConfig.cookies.trim() === '') {
    issues.push('Отсутствуют cookies для CS.Money');
  }

  if (!steamBotConfig.accountName || !steamBotConfig.password) {
    issues.push('Отсутствуют учетные данные Steam-бота');
  }

  if (!steamBotConfig.sharedSecret || !steamBotConfig.identitySecret) {
    issues.push('Отсутствуют секреты для 2FA Steam-бота');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
}

// Проверяем конфигурации при инициализации модуля
const configStatus = checkConfigurations();
if (!configStatus.isValid) {
  logger.warn(`Найдены проблемы в конфигурации: ${configStatus.issues.join(', ')}`);
} else {
  logger.info('Все конфигурации загружены успешно');
}

module.exports = {
  loadCSMoneyConfig,
  loadSteamBotConfig,
  saveEncryptedConfig,
  loadEncryptedConfig,
  encryptData,
  decryptData,
  checkConfigurations
};
