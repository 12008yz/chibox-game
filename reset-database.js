// Этот скрипт удаляет и пересоздает базу данных полностью
const { Sequelize } = require('sequelize');
const config = require('./config/config');
require('dotenv').config();

// Получаем конфигурацию базы данных
const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Используем подключение к postgres (базовая БД, которая всегда существует)
const adminDb = new Sequelize('postgres', dbConfig.username, dbConfig.password, {
  host: dbConfig.host,
  dialect: dbConfig.dialect,
  logging: console.log
});

async function resetDatabase() {
  console.log('Начинаем полный сброс базы данных...');

  try {
    // Проверяем подключение
    await adminDb.authenticate();
    console.log('Подключение к PostgreSQL успешно установлено.');

    // Удаляем базу данных, если она существует
    console.log(`Удаляем базу данных ${dbConfig.database}, если она существует...`);
    try {
      await adminDb.query(`DROP DATABASE IF EXISTS "${dbConfig.database}" WITH (FORCE);`);
      console.log(`База данных ${dbConfig.database} успешно удалена.`);
    } catch (error) {
      console.error(`Ошибка при удалении базы данных: ${error.message}`);

      // Пробуем более агрессивный метод
      console.log('Пробуем отключить все подключения и удалить базу данных принудительно...');
      try {
        // Отключаем все подключения к базе данных
        await adminDb.query(`
          SELECT pg_terminate_backend(pg_stat_activity.pid)
          FROM pg_stat_activity
          WHERE pg_stat_activity.datname = '${dbConfig.database}'
          AND pid <> pg_backend_pid();
        `);
        console.log('Все подключения отключены.');

        // Пробуем удалить базу данных снова
        await adminDb.query(`DROP DATABASE IF EXISTS "${dbConfig.database}";`);
        console.log(`База данных ${dbConfig.database} успешно удалена.`);
      } catch (innerError) {
        console.error(`Не удалось удалить базу данных: ${innerError.message}`);
        throw innerError;
      }
    }

    // Создаем базу данных заново
    console.log(`Создаем базу данных ${dbConfig.database}...`);
    await adminDb.query(`CREATE DATABASE "${dbConfig.database}";`);
    console.log(`База данных ${dbConfig.database} успешно создана.`);

    console.log('Сброс базы данных успешно завершен.');
  } catch (error) {
    console.error('Ошибка при сбросе базы данных:', error);
    throw error;
  } finally {
    // Закрываем подключение
    await adminDb.close();
    console.log('Подключение к базе данных закрыто.');
  }
}

// Запускаем сброс базы данных
resetDatabase()
  .then(() => {
    console.log('Скрипт сброса базы данных успешно выполнен.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Ошибка при выполнении скрипта сброса базы данных:', error);
    process.exit(1);
  });
