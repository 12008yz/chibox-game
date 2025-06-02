module.exports = {
   accountName: process.env.STEAM_ACCOUNT_NAME || 'adavan3',
   password: process.env.STEAM_PASSWORD || '9524Vlad1243Stalker',
   sharedSecret: process.env.STEAM_SHARED_SECRET || 'RfqZkqnNJDGZxXLLmCEuiaMOBiA=',
   identitySecret: process.env.STEAM_IDENTITY_SECRET || 'P2tHB9XcWaIMcrpzQ1Ogn/0Vulg=',
   steamApiKey: process.env.STEAM_API_KEY || '',
   steamId: '76561198115128811',
 
   // Дополнительные настройки
   enableAutoConfirm: true,
   confirmationInterval: 10000, // интервал проверки подтверждений в мс
   maxTradeOffers: 30, // максимум трейдов в день
 
   // Включаем бота, так как данные есть
   enabled: true
 };
 