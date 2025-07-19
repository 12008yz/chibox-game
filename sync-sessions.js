const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const { sequelize } = require('./config/database');

async function syncSessions() {
  try {
    const sessionStore = new SequelizeStore({
      db: sequelize,
    });

    // Синхронизируем таблицу сессий
    await sessionStore.sync();
    console.log('Таблица сессий успешно синхронизирована');

    process.exit(0);
  } catch (error) {
    console.error('Ошибка синхронизации таблицы сессий:', error);
    process.exit(1);
  }
}

syncSessions();
