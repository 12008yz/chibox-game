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

// Защитные миддлвары
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Добавляем compression middleware для сжатия ответов
app.use(compression());

// CORS middleware
app.use(corsMiddleware);

const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1' // Пропускать localhost
});

// Общий лимит - более щедрый
app.use(createRateLimit(15 * 60 * 1000, 1000, 'Общий лимит превышен'));

// Строгие лимиты для аутентификации
const authLimiter = createRateLimit(10 * 60 * 1000, 50, 'Слишком много попыток, попробуйте через 10 минут.');
app.use('/api/v1/login', authLimiter);
app.use('/api/v1/register', createRateLimit(10 * 60 * 1000, 7, 'Слишком много регистраций'));

// Лимиты для игровых действий
app.use('/api/v1/openCase', createRateLimit(60 * 1000, 30, 'Слишком быстро открываете кейсы'));
app.use('/api/v1/buyCase', createRateLimit(60 * 1000, 10, 'Слишком много покупок'));

// Настройка движка представлений
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Увеличиваем лимит для загрузки файлов
// Пропускаем multipart/form-data запросы (для загрузки файлов, например аватары)
app.use((req, res, next) => {
  // Пропускаем парсинг для роута загрузки аватара
  if (req.path === '/api/v1/profile/avatar' && req.method === 'POST') {
    console.log('🔧 Skipping JSON parser for avatar upload');
    return next();
  }
  express.json({ limit: '10mb' })(req, res, next);
});
app.use((req, res, next) => {
  // Пропускаем парсинг для роута загрузки аватара
  if (req.path === '/api/v1/profile/avatar' && req.method === 'POST') {
    console.log('🔧 Skipping URL-encoded parser for avatar upload');
    return next();
  }
  express.urlencoded({ extended: false, limit: '10mb' })(req, res, next);
});
app.use(cookieParser());

// Отладка запросов к avatar
app.use((req, res, next) => {
  if (req.path.includes('avatar')) {
    console.log('🔍 Avatar-related request:', {
      path: req.path,
      url: req.url,
      method: req.method,
      contentType: req.get('content-type')
    });
  }
  next();
});

// Добавляем CORS заголовки для статических файлов
app.use('/images', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

app.use('/Achievements', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

app.use('/avatars', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

// Раздача аватаров через /api/avatars (для совместимости с фронтендом)
app.use('/api/avatars', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'public/avatars')));

app.use(express.static(path.join(__dirname, 'public')));

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

// ============================================
// CSRF ЗАЩИТА
// ============================================
const { doubleCsrf } = require('csrf-csrf');

const {
  generateToken, // Генерация CSRF токена
  doubleCsrfProtection, // CSRF middleware
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || process.env.SESSION_SECRET || 'your-csrf-secret-change-in-production',
  cookieName: '__Host-psifi.x-csrf-token',
  cookieOptions: {
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production', // HTTPS только в продакшене
    httpOnly: true,
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getTokenFromRequest: (req) => req.headers['x-csrf-token'] || req.body?._csrf,
});

// Эндпоинт для получения CSRF токена (публичный)
app.get('/api/v1/csrf-token', (req, res) => {
  const csrfToken = generateToken(req, res);
  res.json({ csrfToken });
});

// Применяем CSRF защиту ко всем POST/PUT/DELETE/PATCH запросам к API
// Исключаем публичные эндпоинты (логин, регистрация)
app.use('/api/v1', (req, res, next) => {
  // Пропускаем CSRF проверку для публичных эндпоинтов
  const publicEndpoints = ['/login', '/register', '/csrf-token', '/auth/steam', '/auth/steam/callback'];
  const isPublic = publicEndpoints.some(endpoint => req.path.startsWith(endpoint));

  if (isPublic || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Применяем CSRF защиту
  doubleCsrfProtection(req, res, next);
});

const userRoutes = require('./routes/userRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const authRoutes = require('./routes/authRoutes');
const { requestLogger, logLoginAttempt, logPayment } = require('./utils/logger');

// Монтируем лимит к отдельным маршрутам:
app.use('/api/v1/login', authLimiter);
app.use('/api/v1/register', authLimiter);

// Логирование попыток входа
// Умное логирование запросов (только важные события)
app.use(requestLogger);

app.use(logLoginAttempt);

// Логирование платежей
app.use(logPayment);

// Регистрация маршрутов
app.use('/api/v1', userRoutes);
app.use('/api/payment', paymentRoutes);
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
  console.log('404 ошибка для маршрута:', {
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    query: req.query,
    headers: {
      authorization: req.headers.authorization,
      'user-agent': req.headers['user-agent']
    }
  });
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
