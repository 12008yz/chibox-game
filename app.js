require('dotenv').config();
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { execSync } = require('child_process');
const corsMiddleware = require('./middleware/cors');
const { logger } = require('./utils/logger');

// Импортируем настроенное подключение к базе данных
const { sequelize, testConnection } = require('./config/database');

// Создаем приложение Express
const app = express();

app.set('trust proxy', 1);

// Проверка разрешенных хостов (защита от Host header injection)
app.use((req, res, next) => {
  const allowedHosts = [
    'api.chibox-game.ru',
    'chibox-game.ru',
    'www.chibox-game.ru',
    'localhost',
    '127.0.0.1'
  ];

  const host = req.hostname || req.get('host')?.split(':')[0];

  if (!allowedHosts.includes(host)) {
    logger.warn(`Blocked request from unauthorized host: ${host}`);
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Invalid host'
    });
  }

  next();
});

// Защитные миддлвары
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Добавляем compression middleware для сжатия ответов
app.use(compression());

// CORS middleware
app.use(corsMiddleware);

const createRateLimit = (windowMs, max, message, useUserId = false) => rateLimit({
  windowMs,
  max,
  message,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1', // Пропускать localhost
  // ИСПРАВЛЕНИЕ: для авторизованных запросов используем user_id вместо IP
  keyGenerator: (req) => {
    if (useUserId && req.user && req.user.id) {
      return `user_${req.user.id}`;
    }
    return req.ip;
  },
  // ИСПРАВЛЕНИЕ: возвращаем JSON вместо текста
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: message,
      error: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(windowMs / 1000)
    });
  }
});

// Общий лимит - защита от DDoS (500 запросов в минуту с одного IP)
app.use(createRateLimit(1 * 60 * 1000, 500, 'Слишком много запросов. Попробуйте через минуту.'));

// Строгие лимиты для аутентификации (защита от brute-force)
const authLimiter = createRateLimit(15 * 60 * 1000, 5, 'Слишком много попыток входа. Попробуйте через 15 минут.');
app.use('/api/v1/login', authLimiter);
app.use('/api/v1/register', createRateLimit(60 * 60 * 1000, 3, 'Слишком много регистраций. Попробуйте через час.'));

// Лимиты для игровых действий - баланс между UX и защитой (ПО ПОЛЬЗОВАТЕЛЮ!)
//app.use('/api/v1/open-case', createRateLimit(60 * 1000, 150, 'Слишком быстро открываете кейсы. Максимум 150 в минуту.', true));
//app.use('/api/v1/cases/buy', createRateLimit(60 * 1000, 100, 'Слишком много покупок. Максимум 100 в минуту.', true));

// Настройка движка представлений
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// JSON и URL-encoded парсинг
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());

// Раздача статических файлов для обратной совместимости
app.use('/images', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'public/images')));

app.use('/Achievements', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'public/Achievements')));

// CORS заголовки и раздача статических файлов из папки public
app.use('/public', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'public')));

// Middleware для защиты от двойной отправки заголовков
app.use((req, res, next) => {
  const originalRender = res.render;
  const originalSend = res.send;
  const originalJson = res.json;

  res.render = function(...args) {
    if (res.headersSent) {
      console.error('Headers already sent, skipping render');
      return;
    }
    return originalRender.apply(this, args);
  };

  res.send = function(...args) {
    if (res.headersSent) {
      console.error('Headers already sent, skipping send');
      return;
    }
    return originalSend.apply(this, args);
  };

  res.json = function(...args) {
    if (res.headersSent) {
      console.error('Headers already sent, skipping json');
      return;
    }
    return originalJson.apply(this, args);
  };

  next();
});

// Сессии для Passport
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);

const sessionStore = new SequelizeStore({
  db: sequelize,
  tableName: 'Sessions',
  checkExpirationInterval: 15 * 60 * 1000, // Проверка истекших сессий каждые 15 минут
  expiration: 7 * 24 * 60 * 60 * 1000, // 7 дней
  disableTouch: false // Обновлять время последнего доступа
});

// Синхронизируем таблицу сессий
sessionStore.sync();

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  store: sessionStore,
  resave: false,
  saveUninitialized: false, // ВАЖНО: false для предотвращения создания лишних сессий
  cookie: {
    secure: false, // Установлено в false для работы с HTTP в разработке
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
    sameSite: 'lax' // Добавлено для лучшей совместимости с OAuth
  },
  // Дополнительные настройки для производительности
  rolling: false, // Не обновлять cookie при каждом запросе
  unset: 'destroy' // Удалять сессию из store при уничтожении
}));

// Инициализация Passport
const passport = require('./config/passport');
app.use(passport.initialize());
app.use(passport.session());

// Мониторинг пула соединений БД (в режиме разработки)
if (process.env.NODE_ENV !== 'production') {
  const { monitorPool } = require('./middleware/pool-monitor');
  app.use(monitorPool);
}

// Периодическая очистка старых сессий (каждый час)
const cleanupSessions = require('./scripts/cleanup-sessions');
setInterval(() => {
  cleanupSessions().catch(err => logger.error('Ошибка очистки сессий:', err));
}, 60 * 60 * 1000); // 1 час

// CSRF защита убрана, так как пакет csurf deprecated
// Для API используем JWT токены, что более безопасно

// CSRF защита удалена - используем JWT для API
// Для веб-форм можно добавить альтернативную защиту при необходимости

const userRoutes = require('./routes/userRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const authRoutes = require('./routes/authRoutes');
const { requestLogger, logLoginAttempt, logPayment } = require('./utils/logger');

// Логирование попыток входа
// Умное логирование запросов (только важные события)
app.use(requestLogger);

app.use(logLoginAttempt);

// Логирование платежей
app.use(logPayment);

// Регистрация маршрутов
app.use('/api/v1', userRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payment', paymentRoutes); // алиас для Unitpay (в ЛК часто указывают /api/payment)
app.use('/api/v1/auth', authRoutes);

// Проверка подключений к базе данных и Redis
(async () => {
  try {
    // Проверяем подключение к базе данных
    const connected = await testConnection();

    if (connected) {
      logger.info('База данных подключена успешно.');

      // Проверяем подключение к Redis
      try {
        const redis = require('redis');
        const testRedisClient = redis.createClient({
          url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
        });
        await testRedisClient.connect();
        await testRedisClient.ping();
        logger.info('Redis подключен успешно');
        await testRedisClient.disconnect();
      } catch (redisError) {
        logger.warn('Предупреждение: Не удалось подключиться к Redis:', redisError.message);
        logger.warn('Кэширование будет недоступно, но приложение продолжит работу');
      }

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
  // Пропускаем статические файлы и другие системные запросы
  if (req.path.startsWith('/public/') || req.path.startsWith('/images/') || req.path.startsWith('/Achievements/')) {
    return next(createError(404));
  }
  
  // Логируем только важные 404 (не статические файлы)
  if (!req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    logger.warn('404 ошибка для маршрута:', {
      method: req.method,
      url: req.originalUrl,
      path: req.path,
      query: req.query,
      host: req.hostname,
      ip: req.ip
    });
  }
  next(createError(404));
});

// Обработчик ошибок
app.use(function(err, req, res, next) {
  // Проверяем, не были ли уже отправлены заголовки
  if (res.headersSent) {
    console.error('Headers already sent, cannot handle error:', err);
    return next(err);
  }

  // Настройка локальных переменных, предоставление ошибки только в среде разработки
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // Рендеринг страницы ошибки с передачей title
  res.status(err.status || 500);
  res.render('error', { title: 'Ошибка' });
});

module.exports = app;
