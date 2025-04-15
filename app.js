const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');

// Импортируем настроенное подключение к базе данных
const { sequelize, testConnection } = require('./config/database');

// Создаем приложение Express
const app = express();

// Настройка движка представлений
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Проверка подключения к базе данных и синхронизация моделей
(async () => {
  try {
    // Проверяем подключение
    const connected = await testConnection();

    if (connected) {
      // Здесь импортируем модели после проверки соединения
      // Это важно, чтобы не было циклических зависимостей
      const User = require('./models/User');

      // Синхронизация моделей с базой данных (создание таблиц)
      try {
        await sequelize.sync({ alter: false });
        console.log('Модели синхронизированы с базой данных.');
      } catch (error) {
        console.error('Ошибка синхронизации моделей:', error);
      }
    }

    // Импортируем маршруты после инициализации моделей
    const indexRouter = require('./routes/index');
    const usersRouter = require('./routes/users');

    // Регистрация маршрутов
    app.use('/', indexRouter);
    app.use('/users', usersRouter);

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

  // Рендеринг страницы ошибки
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
