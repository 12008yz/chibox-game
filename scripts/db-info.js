require('dotenv').config();
const { sequelize } = require('../config/database');
const { QueryTypes } = require('sequelize');

async function showDatabaseInfo() {
  try {
    console.log('\n📊 Информация о базе данных\n');

    // Подключаемся к БД
    await sequelize.authenticate();
    console.log('✅ Подключение успешно');
    console.log(`🗄️  База данных: ${process.env.DB_DATABASE}`);
    console.log(`🖥️  Хост: ${process.env.DB_HOST}`);
    console.log(`👤 Пользователь: ${process.env.DB_USERNAME}\n`);

    // Получаем список таблиц
    const tables = await sequelize.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      { type: QueryTypes.SELECT }
    );

    console.log('📋 Таблицы в базе данных:\n');
    console.log('─'.repeat(80));

    if (tables.length === 0) {
      console.log('  ⚠️  Таблицы не найдены. Возможно, миграции не были запущены.');
      console.log('  💡 Запустите миграции из папки проекта\n');
    } else {
      for (const table of tables) {
        try {
          // Получаем количество записей
          const count = await sequelize.query(
            `SELECT COUNT(*) as count FROM "${table.table_name}"`,
            { type: QueryTypes.SELECT }
          );

          console.log(`  ${table.table_name.padEnd(40)} | ${count[0].count} записей`);
        } catch (err) {
          console.log(`  ${table.table_name.padEnd(40)} | ошибка чтения`);
        }
      }

      console.log('─'.repeat(80));
      console.log(`\nВсего таблиц: ${tables.length}\n`);
    }

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    await sequelize.close();
  }
}

showDatabaseInfo();
