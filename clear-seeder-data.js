// Скрипт для очистки данных сидеров
require('dotenv').config();
const { Sequelize } = require('sequelize');

const dbConfig = {
  username: String(process.env.DB_USERNAME || 'postgres'),
  password: String(process.env.DB_PASSWORD || ''),
  database: String(process.env.DB_DATABASE || 'chibox-game'),
  host: String(process.env.DB_HOST || '127.0.0.1'),
  dialect: String(process.env.DB_DIALECT || 'postgres')
};

const db = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
  host: dbConfig.host,
  dialect: dbConfig.dialect,
  logging: console.log
});

async function clearSeederData() {
  console.log('🧹 ОЧИСТКА ДАННЫХ СИДЕРОВ');
  console.log('='.repeat(40));

  try {
    await db.authenticate();
    console.log('✅ Подключение к базе данных установлено');

    // Очищаем таблицы в правильном порядке (учитывая внешние ключи)
    const tables = [
      'case_template_items',  // Сначала связанные таблицы
      'case_templates',       // Затем основные
      'achievements',
      'promo_codes',
      'level_settings'
    ];

    for (const table of tables) {
      try {
        const result = await db.query(`DELETE FROM ${table} WHERE 1=1;`);
        console.log(`✅ Очищена таблица: ${table}`);
      } catch (error) {
        console.log(`⚠️  Ошибка при очистке ${table}: ${error.message}`);
      }
    }

    // Также очищаем таблицу SequelizeData (метаданные сидеров)
    try {
      await db.query(`DELETE FROM "SequelizeData" WHERE name LIKE '%seeder%';`);
      console.log('✅ Очищены метаданные сидеров');
    } catch (error) {
      console.log('⚠️  Таблица SequelizeData не найдена (это нормально)');
    }

    console.log('\n🎉 Очистка завершена! Теперь можно запустить сидеры заново.');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    await db.close();
  }
}

clearSeederData().catch(console.error);
