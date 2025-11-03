const { Sequelize } = require('sequelize');
require('dotenv').config();
const config = require('./config');

// Получаем конфигурацию для текущего окружения
const env = process.env.NODE_ENV || 'development';

// Используем переменные окружения из .env, если они заданы, иначе берем из config
const dbConfig = {
  username: process.env.DB_USERNAME || config[env].username,
  password: String(process.env.DB_PASSWORD || config[env].password || ''),
  database: process.env.DB_DATABASE || config[env].database,
  host: process.env.DB_HOST || config[env].host,
  dialect: process.env.DB_DIALECT || config[env].dialect,
};

// Создаем экземпляр Sequelize
const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    dialect: dbConfig.dialect,
    logging: false, // Отключаем логи SQL для production
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: false
    },
    pool: {
      max: 50,              // Увеличено для Socket.IO и множественных соединений
      min: 5,               // Минимальные соединения
      acquire: 60000,       // Увеличен timeout до 60 секунд
      idle: 10000,          // Освобождать неактивные соединения через 10 сек
      evict: 1000,          // Проверка каждую секунду
      handleDisconnects: true,
      maxUses: 1000        // Переиспользовать соединение максимум 1000 раз
    },
    retry: {
      max: 3               // Максимум 3 попытки переподключения
    }
  }
);

// Функция для проверки подключения
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('Соединение с базой данных успешно установлено.');
    return true;
  } catch (error) {
    console.error('Не удалось подключиться к базе данных:', error);
    return false;
  }
};

module.exports = { sequelize, testConnection };
