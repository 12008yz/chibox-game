require('dotenv').config();
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const { execSync } = require('child_process');
const csurf = require('csurf');
const corsMiddleware = require('./middleware/cors');

// Winston Logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
  ],
});

// Импортируем настроенное подключение к базе данных
const { sequelize, testConnection } = require('./config/database');

// Создаем приложение Express
const app = express();

app.set('trust proxy', 1);

// Защитные миддлвары
app.use(helmet());

// CORS middleware
app.use(corsMiddleware);

// Общий лимит на все запросы
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Слишком много запросов с этого IP, попробуйте позже.'
}));

// Для login и register — отдельный лимит по 5 попыток на 10 минут на IP
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 минут
  max: 5,
  message: 'Слишком много попыток, попробуйте через 10 минут.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Настройка движка представлений
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const csrf = require('csurf');

// Подключение CSRF защиты с использованием cookie
const csrfProtection = csrf({ cookie: true });

// Исключаем некоторые маршруты из CSRF защиты, например, API маршруты, которые не используют cookie
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  csrfProtection(req, res, next);
});

// Добавление middleware для передачи CSRF токена в ответах (например, в locals для шаблонов)
app.use((req, res, next) => {
  if (req.csrfToken) {
    res.locals.csrfToken = req.csrfToken();
  }
  next();
});

const userRoutes = require('./routes/userRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { logLoginAttempt, logPayment } = require('./middleware/logger');

// Монтируем лимит к отдельным маршрутам:
app.use('/api/v1/login', authLimiter);
app.use('/api/v1/register', authLimiter);

// Логирование попыток входа
app.use(logLoginAttempt);

// Логирование платежей
app.use(logPayment);

// Регистрация маршрутов
app.use('/api/v1', userRoutes);
app.use('/api/payment', paymentRoutes);

// Проверка подключения к базе данных и применение миграций
(async () => {
  try {
    // Проверяем подключение
    const connected = await testConnection();

    if (connected) {
      logger.info('База данных подключена успешно.');

      // Запуск миграций через Sequelize CLI
      if (process.env.RUN_MIGRATIONS === 'true') {
        try {
          logger.info('Запуск миграций...');
          const output = execSync('npx sequelize-cli db:migrate', { encoding: 'utf8' });
          logger.info('Результат выполнения миграций:');
          logger.info(output);
        } catch (migrationError) {
          logger.error('Ошибка при выполнении миграций:', migrationError.message);
          if (migrationError.stdout) logger.info('Вывод: ' + migrationError.stdout);
          if (migrationError.stderr) logger.error('Ошибки: ' + migrationError.stderr);
        }
      }

      // Здесь импортируем модели после проверки соединения
      const db = require('./models');

      // Синхронизация моделей с базой данных (только в режиме разработки)
      if (process.env.NODE_ENV === 'development' && process.env.SYNC_MODELS === 'true') {
        try {
          // Используем alter: true вместо force: true
          await db.sequelize.sync({ force: false });
          logger.info('Все модели успешно синхронизированы с базой данных.');
        } catch (error) {
          logger.error('Ошибка синхронизации моделей:', error);
        }
      }
    }
  } catch (error) {
    logger.error('Ошибка при инициализации приложения:', error);
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
