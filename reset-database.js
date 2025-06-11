// Исправленная версия скрипта для сброса базы данных
require('dotenv').config();
const { Sequelize } = require('sequelize');

console.log('=== ИСПРАВЛЕННЫЙ СКРИПТ СБРОСА БД ===');

// Принудительно преобразуем все переменные в строки
const dbConfig = {
  username: String(process.env.DB_USERNAME || 'postgres'),
  password: String(process.env.DB_PASSWORD || ''),
  database: String(process.env.DB_DATABASE || 'chibox-game'),
  host: String(process.env.DB_HOST || '127.0.0.1'),
  dialect: String(process.env.DB_DIALECT || 'postgres')
};

console.log('Конфигурация БД:');
console.log('- username:', dbConfig.username);
console.log('- password:', '***' + (dbConfig.password ? ' (задан)' : ' (пустой)'));
console.log('- database:', dbConfig.database);
console.log('- host:', dbConfig.host);
console.log('- dialect:', dbConfig.dialect);

// Используем подключение к postgres (базовая БД, которая всегда существует)
const adminDb = new Sequelize('postgres', dbConfig.username, dbConfig.password, {
  host: dbConfig.host,
  dialect: dbConfig.dialect,
  logging: console.log
});

async function resetDatabase() {
  console.log('\nНачинаем полный сброс базы данных...');

  try {
    // Проверяем подключение
    console.log('Проверяем подключение к PostgreSQL...');
    await adminDb.authenticate();
    console.log('✅ Подключение к PostgreSQL успешно установлено.');

    // Удаляем базу данных, если она существует
    console.log(`\nУдаляем базу данных "${dbConfig.database}", если она существует...`);
    try {
      await adminDb.query(`DROP DATABASE IF EXISTS "${dbConfig.database}" WITH (FORCE);`);
      console.log(`✅ База данных "${dbConfig.database}" успешно удалена.`);
    } catch (error) {
      console.error(`❌ Ошибка при удалении базы данных: ${error.message}`);

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
        console.log('✅ Все подключения отключены.');

        // Пробуем удалить базу данных снова
        await adminDb.query(`DROP DATABASE IF EXISTS "${dbConfig.database}";`);
        console.log(`✅ База данных "${dbConfig.database}" успешно удалена.`);
      } catch (innerError) {
        console.error(`❌ Не удалось удалить базу данных: ${innerError.message}`);
        throw innerError;
      }
    }

    // Создаем базу данных заново
    console.log(`\nСоздаем базу данных "${dbConfig.database}"...`);
    await adminDb.query(`CREATE DATABASE "${dbConfig.database}";`);
    console.log(`✅ База данных "${dbConfig.database}" успешно создана.`);

    console.log('\n🎉 Сброс базы данных успешно завершен.');
  } catch (error) {
    console.error('\n❌ Ошибка при сбросе базы данных:', error);
    console.error('Детали ошибки:');
    console.error('- message:', error.message);
    console.error('- name:', error.name);
    if (error.parent) {
      console.error('- parent message:', error.parent.message);
    }
    throw error;
  } finally {
    // Закрываем подключение
    await adminDb.close();
    console.log('\n🔌 Подключение к базе данных закрыто.');
  }
}

// Запускаем сброс базы данных
resetDatabase()
  .then(() => {
    console.log('\n✅ Скрипт сброса базы данных успешно выполнен.');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Ошибка при выполнении скрипта сброса базы данных:', error.message);
    process.exit(1);
  });
