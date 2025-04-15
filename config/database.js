const { Sequelize } = require('sequelize');
const config = require('./config');

// Получаем конфигурацию для текущего окружения
const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Создаем экземпляр Sequelize
const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  {
    host: dbConfig.host,
    dialect: dbConfig.dialect,
    logging: console.log, // Можно установить false для отключения логов SQL-запросов
    define: {
      timestamps: true, // Добавляем timestamps во все модели по умолчанию
      underscored: false, // Использовать snake_case вместо camelCase для полей
      freezeTableName: false // Не преобразовывать имена таблиц
    },
    pool: {
      max: 5, // Максимальное количество соединений в пуле
      min: 0, // Минимальное количество соединений в пуле
      acquire: 30000, // Максимальное время в мс для получения соединения из пуля
      idle: 10000 // Максимальное время в мс, в течение которого соединение может быть неактивным
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
