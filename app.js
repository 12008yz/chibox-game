require('dotenv').config();

// Оставляем только полезные ошибки/предупреждения для диагностики.
const NOOP = () => {};
const winston = require('winston');
const silentLogger = {
  info: NOOP,
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: NOOP,
  log: NOOP,
  child: () => silentLogger
};
winston.createLogger = () => silentLogger;
console.log = NOOP;
console.info = NOOP;
// warn/error оставляем включенными
console.debug = NOOP;

// В production обязательны секреты (без дефолтов)
if (process.env.NODE_ENV === 'production') {
  const required = [
    { name: 'SESSION_SECRET', value: process.env.SESSION_SECRET, minLen: 32 },
    { name: 'JWT_SECRET', value: process.env.JWT_SECRET, minLen: 32 },
    { name: 'JWT_REFRESH_SECRET', value: process.env.JWT_REFRESH_SECRET, minLen: 32 }
  ];
  for (const { name, value, minLen } of required) {
    if (!value || value.length < minLen) {
      console.error(`[FATAL] In production ${name} must be set and at least ${minLen} characters.`);
      process.exit(1);
    }
  }
}

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

/**
 * Асинхронная фабрика приложения: поднимает Redis (сессии + rate-limit), при недоступности — fallback на БД/память.
 * Для 500+ пользователей и кластера нужны Redis и общий rate-limit.
 */
async function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  // Проверка Host: с мобильного интернета прокси/оператор может подставлять другой Host (например IP).
  // Учитываем X-Forwarded-Host (если запрос через nginx) и разрешаем любой поддомен chibox-game.ru.
  // Заход по публичному IP (тесты, health-check, редкие клиенты) — через ALLOWED_EXTRA_HOSTS=185.x.x.x
  const extraHosts = (process.env.ALLOWED_EXTRA_HOSTS || '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  app.use((req, res, next) => {
    const allowedHosts = [
      'api.chibox-game.ru',
      'chibox-game.ru',
      'www.chibox-game.ru',
      'streamer.chibox-game.ru',
      'localhost',
      '127.0.0.1',
      ...extraHosts
    ];
    const forwardedHost = req.get('x-forwarded-host');
    const host = (forwardedHost ? forwardedHost.split(',')[0].trim() : null) ||
      req.hostname ||
      req.get('host')?.split(':')[0] ||
      '';
    const allowed = allowedHosts.includes(host) ||
      host === 'chibox-game.ru' ||
      (host && host.endsWith('.chibox-game.ru'));
    if (!allowed) {
      logger.warn(`Blocked request from unauthorized host: ${host}`);
      return res.status(403).json({ success: false, message: 'Forbidden: Invalid host' });
    }
    next();
  });

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://mc.yandex.ru", "https://yastatic.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:", "http:"],
        connectSrc: ["'self'", "wss:", "ws:", "https:", "http:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        objectSrc: ["'self'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'self'", "https://yoomoney.ru", "https://*.yoomoney.ru"]
      },
    },
  }));
  const shouldUseAppCompression =
    process.env.NODE_ENV !== 'production' || process.env.ENABLE_APP_COMPRESSION === 'true';
  if (shouldUseAppCompression) {
    app.use(compression());
  } else {
    logger.info('HTTP compression в Express отключен (используется nginx gzip/brotli).');
  }
  app.use(corsMiddleware);

  const createRateLimit = (windowMs, max, message, useUserId = false, store = null) => rateLimit({
    windowMs,
    max,
    message,
    store: store || undefined,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.ip === '127.0.0.1',
    keyGenerator: (req) => {
      if (useUserId && req.user && req.user.id) return `user_${req.user.id}`;
      return req.ip;
    },
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message,
        error: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });

  // Redis для сессий и rate-limit (общий лимит на все воркеры при кластере).
  // В development можно отключить: USE_REDIS=false или SKIP_REDIS=true в .env — тогда сессии в PostgreSQL, кейсы и логин работают без Redis.
  let sessionStore = null;
  let rateLimitStore = null;
  const skipRedis = process.env.NODE_ENV === 'development' &&
    (process.env.USE_REDIS === 'false' || process.env.SKIP_REDIS === 'true');
  if (skipRedis) {
    logger.info('Redis отключён (USE_REDIS=false/SKIP_REDIS=true), сессии в PostgreSQL');
  } else {
    try {
      const redisStores = await require('./config/redisStores').createRedisStores();
      sessionStore = redisStores.sessionStore;
      rateLimitStore = redisStores.rateLimitStore;
    } catch (err) {
      logger.warn('Инициализация Redis stores не удалась:', err.message);
    }
  }

  // Общий лимит — с Redis при кластере лимит общий на все инстансы
  app.use(createRateLimit(1 * 60 * 1000, 500, 'Слишком много запросов. Попробуйте через минуту.', false, rateLimitStore));

  // Строгие лимиты для аутентификации
  const authLimiter = createRateLimit(15 * 60 * 1000, 5, 'Слишком много попыток входа. Попробуйте через 15 минут.', false, rateLimitStore);
  app.use('/api/v1/login', authLimiter);
  app.use('/api/v1/register', createRateLimit(60 * 60 * 1000, 3, 'Слишком много регистраций. Попробуйте через час.', false, rateLimitStore));

  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'pug');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: false, limit: '10mb' }));
  app.use(cookieParser());

  const serveStaticWithWebp = (dir) => {
    return [
      (req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        res.header('Cross-Origin-Resource-Policy', 'cross-origin');
        
        if (process.env.NODE_ENV !== 'production' && req.path.match(/\.(png|jpg|jpeg)$/i)) {
          const fs = require('fs');
          const webpPath = req.path.replace(/\.(png|jpg|jpeg)$/i, '.webp');
          const fullWebpPath = path.join(dir, webpPath);
          
          if (fs.existsSync(fullWebpPath)) {
            req.url = webpPath;
          }
        }
        next();
      },
      express.static(dir, {
        maxAge: '180d',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.webp')) {
            res.setHeader('Content-Type', 'image/webp');
          }
        }
      })
    ];
  };

  const imagesPath = path.join(__dirname, 'public/images');
  app.use('/images', serveStaticWithWebp(imagesPath));

  app.use('/Achievements', serveStaticWithWebp(path.join(__dirname, 'public/Achievements')));

  app.use('/public', serveStaticWithWebp(path.join(__dirname, 'public')));

  app.use((req, res, next) => {
    const originalRender = res.render;
    const originalSend = res.send;
    const originalJson = res.json;
    res.render = function(...args) {
      if (res.headersSent) return;
      return originalRender.apply(this, args);
    };
    res.send = function(...args) {
      if (res.headersSent) return;
      return originalSend.apply(this, args);
    };
    res.json = function(...args) {
      if (res.headersSent) return;
      return originalJson.apply(this, args);
    };
    next();
  });

  // Сессии: Redis (при 500+ и кластере) или PostgreSQL
  const session = require('express-session');
  let activeSessionStore = sessionStore;
  if (!activeSessionStore) {
    const SequelizeStore = require('connect-session-sequelize')(session.Store);
    activeSessionStore = new SequelizeStore({
      db: sequelize,
      tableName: 'Sessions',
      checkExpirationInterval: 15 * 60 * 1000,
      expiration: 7 * 24 * 60 * 60 * 1000,
      disableTouch: false
    });
    await activeSessionStore.sync();
    logger.info('Сессии: PostgreSQL (Redis недоступен)');
  }

  app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    store: activeSessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    },
    rolling: false,
    unset: 'destroy'
  }));

  // Passport
  const passport = require('./config/passport');
  app.use(passport.initialize());
  app.use(passport.session());

  if (process.env.NODE_ENV !== 'production') {
    const { monitorPool } = require('./middleware/pool-monitor');
    app.use(monitorPool);
  }

  const cleanupSessions = require('./scripts/cleanup-sessions');
  setInterval(() => {
    cleanupSessions().catch(err => logger.error('Ошибка очистки сессий:', err));
  }, 60 * 60 * 1000);

  const userRoutes = require('./routes/userRoutes');
  const paymentRoutes = require('./routes/paymentRoutes');
  const authRoutes = require('./routes/authRoutes');
  const referralRoutes = require('./routes/referralRoutes');
  const streamerRoutes = require('./routes/streamerRoutes');
  const { requestLogger, logLoginAttempt, logPayment } = require('./utils/logger');

  app.use(requestLogger);
  app.use(logLoginAttempt);
  app.use(logPayment);

  app.use('/api/v1', userRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/payment', paymentRoutes);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/referral', referralRoutes);
  app.use('/api/v1/streamer', streamerRoutes);

  try {
    const connected = await testConnection();
    if (connected) {
      logger.info('База данных подключена успешно.');
      if (process.env.RUN_MIGRATIONS === 'true') {
        try {
          logger.info('Запуск миграций...');
          const output = execSync('npx sequelize-cli db:migrate', { encoding: 'utf8' });
          logger.info('Результат выполнения миграций:', output);
        } catch (migrationError) {
          logger.error('Ошибка при выполнении миграций:', migrationError.message);
        }
      }
      const db = require('./models');
      if (process.env.NODE_ENV === 'development' && process.env.SYNC_MODELS === 'true') {
        try {
          await db.sequelize.sync({ force: false });
          logger.info('Модели синхронизированы с БД.');
        } catch (error) {
          logger.error('Ошибка синхронизации моделей:', error);
        }
      }
    }
  } catch (error) {
    logger.error('Ошибка при инициализации приложения:', error);
  }

  // 404
  app.use(function(req, res, next) {
    if (req.path.startsWith('/public/') || req.path.startsWith('/images/') || req.path.startsWith('/Achievements/')) {
      return next(createError(404));
    }
    if (!req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
      logger.warn('404:', { method: req.method, url: req.originalUrl, path: req.path });
    }
    next(createError(404));
  });

  app.use(function(err, req, res, next) {
    if (res.headersSent) return next(err);
    const status = err.status || 500;
    const isConnectionError = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' ||
      (err.message && typeof err.message === 'string' && err.message.includes('ECONNRESET'));
    const safeMessage = isConnectionError
      ? 'Сервис временно недоступен. Попробуйте через несколько секунд.'
      : (err.message || 'Внутренняя ошибка сервера');
    if (isConnectionError) {
      logger.warn('Ошибка соединения (не показываем клиенту):', err.code || err.message);
    }
    res.status(status);
    if (req.path.startsWith('/api/')) {
      return res.json({
        success: false,
        message: safeMessage,
        ...(req.app.get('env') === 'development' && !isConnectionError && { error: err.stack }),
      });
    }
    res.locals.message = safeMessage;
    res.locals.error = req.app.get('env') === 'development' && !isConnectionError ? err : {};
    res.render('error', { title: 'Ошибка' });
  });

  return app;
}

module.exports = createApp;
