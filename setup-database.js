// Полный скрипт для настройки базы данных с нуля
require('dotenv').config();
const { Sequelize } = require('sequelize');
const { exec } = require('child_process');
const path = require('path');
const util = require('util');

const execAsync = util.promisify(exec);

console.log('🚀 ПОЛНАЯ НАСТРОЙКА БАЗЫ ДАННЫХ');
console.log('='.repeat(50));

// Конфигурация базы данных
const dbConfig = {
  username: String(process.env.DB_USERNAME || 'postgres'),
  password: String(process.env.DB_PASSWORD || ''),
  database: String(process.env.DB_DATABASE || 'chibox-game'),
  host: String(process.env.DB_HOST || '127.0.0.1'),
  dialect: String(process.env.DB_DIALECT || 'postgres')
};

console.log('📋 Конфигурация:');
console.log(`   База данных: ${dbConfig.database}`);
console.log(`   Пользователь: ${dbConfig.username}`);
console.log(`   Хост: ${dbConfig.host}`);

async function setupDatabase() {
  try {
    console.log('\n📝 Шаг 1: Сброс базы данных');
    await resetDatabase();

    console.log('\n📝 Шаг 2: Установка зависимостей');
    await installDependencies();

    console.log('\n📝 Шаг 3: Выполнение миграций');
    await runMigrations();

    console.log('\n📝 Шаг 4: Заполнение начальными данными');
    await runSeeders();

    console.log('\n📝 Шаг 5: Проверка таблиц');
    await checkTables();

    console.log('\n🎉 БАЗА ДАННЫХ УСПЕШНО НАСТРОЕНА!');

  } catch (error) {
    console.error('\n❌ Ошибка настройки:', error.message);
    process.exit(1);
  }
}

async function resetDatabase() {
  console.log('   Подключение к PostgreSQL...');

  const adminDb = new Sequelize('postgres', dbConfig.username, dbConfig.password, {
    host: dbConfig.host,
    dialect: dbConfig.dialect,
    logging: false
  });

  try {
    await adminDb.authenticate();
    console.log('   ✅ Подключение установлено');

    // Отключаем все соединения
    try {
      await adminDb.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = '${dbConfig.database}'
        AND pid <> pg_backend_pid();
      `);
    } catch (e) {
      // Игнорируем ошибки, если база не существует
    }

    // Удаляем базу данных
    await adminDb.query(`DROP DATABASE IF EXISTS "${dbConfig.database}";`);
    console.log('   ✅ Старая база данных удалена');

    // Создаем новую базу данных
    await adminDb.query(`CREATE DATABASE "${dbConfig.database}";`);
    console.log('   ✅ Новая база данных создана');

  } finally {
    await adminDb.close();
  }
}

async function installDependencies() {
  try {
    console.log('   Проверка package.json...');
    const { stdout } = await execAsync('npm list sequelize-cli', { cwd: process.cwd() });
    console.log('   ✅ sequelize-cli уже установлен');
  } catch (error) {
    console.log('   Установка sequelize-cli...');
    await execAsync('npm install -g sequelize-cli', { cwd: process.cwd() });
    console.log('   ✅ sequelize-cli установлен');
  }
}

async function runMigrations() {
  console.log('   Выполнение миграций...');

  try {
    const { stdout, stderr } = await execAsync('npx sequelize-cli db:migrate', {
      cwd: process.cwd(),
      env: { ...process.env }
    });

    console.log('   ✅ Миграции выполнены успешно');
    if (stdout) {
      console.log('   📄 Результат:', stdout.trim());
    }
  } catch (error) {
    console.log('   ⚠️  Ошибка миграций:', error.message);
    if (error.stdout) console.log('   📄 STDOUT:', error.stdout);
    if (error.stderr) console.log('   📄 STDERR:', error.stderr);
    throw error;
  }
}

async function runSeeders() {
  console.log('   Заполнение начальными данными...');

  try {
    const { stdout } = await execAsync('npx sequelize-cli db:seed:all', {
      cwd: process.cwd(),
      env: { ...process.env }
    });

    console.log('   ✅ Сидеры выполнены успешно');
    if (stdout) {
      console.log('   📄 Результат:', stdout.trim());
    }
  } catch (error) {
    console.log('   ⚠️  Ошибка сидеров (это нормально, если нет сидеров):', error.message);
    // Не останавливаем выполнение, так как сидеры могут отсутствовать
  }
}

async function checkTables() {
  console.log('   Проверка созданных таблиц...');

  const db = new Sequelize(dbConfig.database, dbConfig.username, dbConfig.password, {
    host: dbConfig.host,
    dialect: dbConfig.dialect,
    logging: false
  });

  try {
    const tables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `, { type: Sequelize.QueryTypes.SELECT });

    console.log(`   ✅ Создано таблиц: ${tables.length}`);
    console.log('   📋 Список таблиц:');

    tables.forEach((table, index) => {
      console.log(`      ${index + 1}. ${table.table_name}`);
    });

    if (tables.length === 0) {
      throw new Error('Таблицы не созданы! Проверьте миграции.');
    }

  } finally {
    await db.close();
  }
}

// Запуск
setupDatabase().catch(console.error);
