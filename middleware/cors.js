const cors = require('cors');

const corsOptions = {
  origin: function (origin, callback) {
    // Разрешаем запросы без origin (например, мобильные приложения)
    if (!origin) return callback(null, true);

    const allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : ['http://localhost:5173', 'http://localhost:3000'];

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  credentials: true,
  optionsSuccessStatus: 204,
  maxAge: 86400, // 24 часа кеширования preflight
};

module.exports = cors(corsOptions);
