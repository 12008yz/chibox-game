module.exports = {
  accountName: process.env.STEAM_ACCOUNT_NAME || 'adavan3',
  password: process.env.STEAM_PASSWORD || '9524Vlad1243Stalker',
  sharedSecret: process.env.STEAM_SHARED_SECRET || 'RfqZkqnNJDGZxXLLmCEuiaMOBiA=',
  identitySecret: process.env.STEAM_IDENTITY_SECRET || 'P2tHB9XcWaIMcrpzQ1Ogn/0Vulg=',
  steamApiKey: process.env.STEAM_API_KEY || '8C8EECB761BBE51563EF7741CE5110EF',
  steamId: '76561198115128811',

  // Session данные - будут заполнены автоматически после логина
  sessionId: process.env.STEAM_SESSION_ID || null,
  steamLoginSecure: process.env.STEAM_LOGIN_SECURE || null,

  // Дополнительные настройки
  enableAutoConfirm: true,
  confirmationInterval: 10000, // интервал проверки подтверждений в мс
  maxTradeOffers: 30, // максимум трейдов в день

  // Настройки для Steam Market
  marketConfig: {
    maxPrice: 10000, // максимальная цена покупки в рублях
    retryAttempts: 3, // количество попыток покупки
    retryDelay: 5000, // задержка между попытками в мс
    currency: 5 // RUB
  },

  // Включаем бота, так как данные есть
  enabled: true
};
