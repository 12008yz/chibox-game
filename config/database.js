const { Sequelize } = require('sequelize');
require('dotenv').config();
const config = require('./config');

// Получаем конфигурацию для текущего окружения
const env = process.env.NODE_ENV || 'development';

// Используем переменные окружения из .env, если они заданы, иначе берем из config
const dbConfig = {
  username: process.env.DB_USERNAME || config[env].username,
  password: process.env.DB_PASSWORD || config[env].password,
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
    dialect: dbConfig.dialect,
    replication: {
      read: [
        {
          host: process.env.DB_READ_HOST_1 || config[env].readHost1,
          username: process.env.DB_USERNAME || config[env].username,
          password: process.env.DB_PASSWORD || config[env].password,
          database: process.env.DB_DATABASE || config[env].database,
          dialect: dbConfig.dialect,
        },
        // Можно добавить дополнительные read реплики
      ],
      write: {
        host: dbConfig.host,
        username: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.database,
        dialect: dbConfig.dialect,
      }
    },
    logging: console.log, // Можно установить false для отключения логов SQL-запросов
    define: {
      timestamps: true, // Добавляем timestamps во все модели по умолчанию
      underscored: false, // Использовать snake_case вместо camelCase для полей
      freezeTableName: false // Не преобразовывать имена таблиц
    },
    pool: {
      max: 20,              // Увеличено до 20
      min: 5,               // Минимум 5 соединений
      acquire: 60000,       // Увеличен timeout
      idle: 30000,          // Увеличен idle time
      evict: 1000,          // Добавлен eviction
      handleDisconnects: true
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