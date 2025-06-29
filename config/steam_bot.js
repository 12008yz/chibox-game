module.exports = {
  accountName: process.env.STEAM_ACCOUNT_NAME,
  password: process.env.STEAM_PASSWORD,
  sharedSecret: process.env.STEAM_SHARED_SECRET,
  identitySecret: process.env.STEAM_IDENTITY_SECRET,
  steamApiKey: process.env.STEAM_API_KEY,
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
  enabled: true,

  // Валидация ключей
  validateSecrets() {
    if (!this.sharedSecret || !this.identitySecret) {
      throw new Error('Missing sharedSecret or identitySecret');
    }
    if (this.sharedSecret.length < 20 || this.identitySecret.length < 20) {
      throw new Error('Invalid secret format - too short');
    }
    console.log('Steam secrets validated successfully');
  }
};
