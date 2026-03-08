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
      max: parseInt(process.env.DB_POOL_MAX, 10) || 80,   // 500+ пользователей: 80–100
      min: parseInt(process.env.DB_POOL_MIN, 10) || 10,
      acquire: 60000,
      idle: 10000,
      evict: 1000,
      handleDisconnects: true,
      maxUses: 1000
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
