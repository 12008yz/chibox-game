const cors = require('cors');

const corsOptions = {
  origin: function (origin, callback) {
    // Для development разрешаем все localhost origins
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }

    let allowedOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
      : [
          'https://chibox-game.ru',
          'https://www.chibox-game.ru',
          'http://chibox-game.ru',
          'https://streamer.chibox-game.ru',
          'http://streamer.chibox-game.ru'
        ];

    // Всегда разрешаем поддомен стримеров, если разрешён основной домен
    const streamerOrigins = ['https://streamer.chibox-game.ru', 'http://streamer.chibox-game.ru'];
    streamerOrigins.forEach((o) => {
      if (allowedOrigins.indexOf(o) === -1) allowedOrigins.push(o);
    });

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin); // Для отладки
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
