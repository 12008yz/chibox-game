const { sequelize } = require('./models');

async function resetDatabase() {
  try {
    console.log('🔄 Начинаем полный сброс базы данных...');

    // Подключаемся к базе данных
    await sequelize.authenticate();
    console.log('✅ Подключение к БД установлено');

    // Удаляем все таблицы
    await sequelize.query('DROP SCHEMA public CASCADE;');
    console.log('✅ Удалена схема public');

    // Создаем схему заново
    await sequelize.query('CREATE SCHEMA public;');
    console.log('✅ Создана схема public');

    // Восстанавливаем права
    await sequelize.query('GRANT ALL ON SCHEMA public TO postgres;');
    await sequelize.query('GRANT ALL ON SCHEMA public TO public;');
    console.log('✅ Права восстановлены');

    console.log('\n✅ База данных полностью сброшена!');
    console.log('\n📝 Теперь выполните миграции:');
    console.log('   npx sequelize-cli db:migrate');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка при сбросе БД:', error);
    await sequelize.close();
    process.exit(1);
  }
}

resetDatabase();
