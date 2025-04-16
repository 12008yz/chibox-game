const { sequelize } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function cleanupDatabase() {
  try {
    console.log('Начинаем очистку базы данных...');

    // Чтение SQL-файла
    const sqlFile = path.join(__dirname, 'cleanup-database.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Разбиваем файл на отдельные SQL-запросы
    const queries = sql.split(';').filter(query => query.trim() !== '');

    // Выполняем каждый запрос отдельно
    for (const query of queries) {
      try {
        await sequelize.query(query + ';');
        console.log('Выполнен запрос:', query.trim().substring(0, 50) + '...');
      } catch (error) {
        console.warn('Предупреждение при выполнении запроса:', error.message);
        // Продолжаем выполнение, даже если отдельные запросы не удались
      }
    }

    console.log('Очистка базы данных завершена успешно.');
  } catch (error) {
    console.error('Ошибка при очистке базы данных:', error);
  } finally {
    await sequelize.close();
  }
}

// Выполнить скрипт
cleanupDatabase().then(() => {
  console.log('Скрипт очистки завершен.');
  process.exit(0);
}).catch(error => {
  console.error('Ошибка при выполнении скрипта очистки:', error);
  process.exit(1);
});
