const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const { execSync } = require('child_process');

// Импортируем настроенное подключение к базе данных
const { sequelize, testConnection } = require('./config/database');

// Создаем приложение Express
const app = express();

// Настройка движка представлений
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Импортируем маршруты синхронно
const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');

// Регистрация маршрутов
app.use('/', indexRouter);
app.use('/users', usersRouter);

// Проверка подключения к базе данных и применение миграций
(async () => {
  try {
    // Проверяем подключение
    const connected = await testConnection();

    if (connected) {
      console.log('База данных подключена успешно.');

      // Запуск миграций через Sequelize CLI
      if (process.env.RUN_MIGRATIONS === 'true') {
        try {
          console.log('Запуск миграций...');
          const output = execSync('npx sequelize-cli db:migrate', { encoding: 'utf8' });
          console.log('Результат выполнения миграций:');
          console.log(output);
        } catch (migrationError) {
          console.error('Ошибка при выполнении миграций:', migrationError.message);
          if (migrationError.stdout) console.log('Вывод:', migrationError.stdout);
          if (migrationError.stderr) console.error('Ошибки:', migrationError.stderr);
        }
      }

      // Здесь импортируем модели после проверки соединения
      const db = require('./models');

      // Синхронизация моделей с базой данных (только в режиме разработки)
      if (process.env.NODE_ENV === 'development' && process.env.SYNC_MODELS === 'true') {
        try {
          // Используем alter: true вместо force: true
          await db.sequelize.sync({ force: false });
          console.log('Все модели успешно синхронизированы с базой данных.');
        } catch (error) {
          console.error('Ошибка синхронизации моделей:', error);
        }
      }
    }
  } catch (error) {
    console.error('Ошибка при инициализации приложения:', error);
  }
})();

// Обработка 404 ошибки
app.use(function(req, res, next) {
  next(createError(404));
});

// Обработчик ошибок
app.use(function(err, req, res, next) {
  // Настройка локальных переменных, предоставление ошибки только в среде разработки
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // Рендеринг страницы ошибки с передачей title
  res.status(err.status || 500);
  res.render('error', { title: 'Ошибка' });
});

module.exports = app;
