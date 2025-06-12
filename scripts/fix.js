#!/usr/bin/env node

const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');
const SteamTotp = require('steam-totp');
const steamBotConfig = require('../config/steam_bot.js');

const client = new SteamUser();
const community = new SteamCommunity();
const manager = new TradeOfferManager({
  steam: client,
  community: community,
  language: 'en',
});

console.log('🔐 Авторизация Steam...');

// Логин
const twoFactorCode = SteamTotp.generateAuthCode(steamBotConfig.sharedSecret);
client.logOn({
  accountName: steamBotConfig.accountName,
  password: steamBotConfig.password,
  twoFactorCode: twoFactorCode
});

client.on('loggedOn', () => {
  console.log('✅ Авторизован в Steam');
});

client.on('webSession', (sessionID, cookies) => {
  console.log('🌐 Получена web сессия');
  manager.setCookies(cookies);
  community.setCookies(cookies);

  if (steamBotConfig.steamApiKey) {
    manager.apiKey = steamBotConfig.steamApiKey;
  }

  console.log('🔍 Поиск трейдов ожидающих подтверждения...');

  // Получаем все исходящие трейды
  manager.getOffers(1, null, (err, sent, received) => {
    if (err) {
      console.error('❌ Ошибка получения трейдов:', err);
      process.exit(1);
    }

    console.log(`📊 Всего исходящих трейдов: ${sent.length}`);

    // Фильтруем трейды ожидающие подтверждения
    const pendingOffers = sent.filter(offer => offer.state === 2);
    console.log(`⏳ Трейдов ожидающих подтверждения: ${pendingOffers.length}`);

    if (pendingOffers.length === 0) {
      console.log('✅ Нет трейдов для подтверждения');
      process.exit(0);
    }

    let confirmed = 0;
    let processed = 0;

    pendingOffers.forEach((offer, index) => {
      setTimeout(() => {
        console.log(`🔄 Подтверждение трейда #${offer.id}...`);

        offer.confirm((confirmErr) => {
          processed++;
          if (confirmErr) {
            console.error(`❌ Ошибка подтверждения трейда #${offer.id}:`, confirmErr.message);
          } else {
            console.log(`✅ Трейд #${offer.id} успешно подтвержден!`);
            confirmed++;
          }

          if (processed === pendingOffers.length) {
            setTimeout(() => {
              console.log(`🏁 Завершено! Подтверждено: ${confirmed}/${pendingOffers.length}`);
              process.exit(0);
            }, 1000);
          }
        });
      }, index * 1500); // Задержка 1.5 сек между подтверждениями
    });
  });
});

client.on('error', (err) => {
  console.error('❌ Ошибка Steam:', err);
  process.exit(1);
});
