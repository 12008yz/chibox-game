#!/usr/bin/env node

/**
 * Скрипт проверки работоспособности Steam трейд-бота.
 *
 * Запуск:
 *   node scripts/test-steam-trade-bot.js
 *   node scripts/test-steam-trade-bot.js "https://steamcommunity.com/tradeoffer/new/?partner=XXXXXXXX&token=YYYYYYYY"
 *
 * Что проверяет:
 *   1. Загрузка конфига и переменных окружения
 *   2. Логин бота в Steam
 *   3. Профиль бота (Steam ID, уровень)
 *   4. Ограничения торговли (canTrade, tradeHold)
 *   5. Загрузка инвентаря CS2 (количество предметов)
 *   6. Валидация Trade URL (если передан аргументом)
 *   7. Статус confirmation checker (для автоподтверждения трейдов)
 *
 * Не отправляет реальные трейды. Для полного теста вывода используйте
 * withdrawal-processor или заявку на вывод с сайта.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SteamBot = require('../services/steamBotService');
const steamBotConfig = require('../config/steam_bot.js');

const testTradeUrl = process.argv[2] || null;

async function main() {
  console.log('=== Проверка Steam трейд-бота ===\n');

  // 1. Конфиг
  const hasConfig =
    steamBotConfig.accountName &&
    steamBotConfig.password &&
    steamBotConfig.sharedSecret &&
    steamBotConfig.identitySecret;
  if (!hasConfig) {
    console.error('❌ В .env не заданы STEAM_ACCOUNT_NAME, STEAM_PASSWORD, STEAM_SHARED_SECRET, STEAM_IDENTITY_SECRET');
    process.exit(1);
  }
  console.log('✅ Конфиг загружен (логин, sharedSecret, identitySecret)');
  if (!steamBotConfig.steamApiKey) {
    console.warn('⚠️ STEAM_API_KEY не задан — отправка трейдов может не работать');
  } else {
    console.log('✅ STEAM_API_KEY задан');
  }

  const bot = new SteamBot(
    steamBotConfig.accountName,
    steamBotConfig.password,
    steamBotConfig.sharedSecret,
    steamBotConfig.identitySecret,
    steamBotConfig.steamApiKey
  );

  try {
    // 2. Логин
    console.log('\n--- Логин в Steam ---');
    await bot.login();
    console.log('✅ Бот авторизован в Steam');

    // 3. Профиль
    console.log('\n--- Профиль бота ---');
    const profile = await bot.getProfileInfo();
    if (profile.error) {
      console.error('❌ Профиль:', profile.error);
    } else {
      console.log('  SteamID64:', profile.steamId);
      console.log('  Уровень:', profile.steamLevel);
      console.log('  Страна:', profile.country);
    }

    // 4. Ограничения торговли
    console.log('\n--- Ограничения торговли ---');
    const restrictions = await bot.getTradeRestrictions();
    if (restrictions.error || !restrictions.canTrade) {
      console.error('❌ Торговля ограничена:', restrictions.error || 'canTrade: false');
    } else {
      console.log('  canTrade:', restrictions.canTrade);
      console.log('  tradeHold:', restrictions.tradeHold || false);
      console.log('  Steam Guard:', restrictions.steamGuardEnabled ? 'включен' : 'выключен');
      console.log('✅ Бот может отправлять трейды');
    }

    // 5. Инвентарь CS2 (appid 730, context 2)
    console.log('\n--- Инвентарь CS2 ---');
    const inventory = await bot.getInventory(730, 2, true);
    console.log('  Предметов (tradable):', inventory.length);
    if (inventory.length > 0) {
      const sample = inventory.slice(0, 3).map(i => ({ name: i.market_hash_name, assetid: i.assetid }));
      console.log('  Примеры:', JSON.stringify(sample, null, 2));
    } else {
      console.warn('⚠️ Инвентарь пуст — вывод через бота работать не будет, пока в инвентаре нет предметов');
    }

    // 6. Валидация Trade URL
    if (testTradeUrl) {
      console.log('\n--- Валидация Trade URL ---');
      const validation = await bot.validateTradeUrl(testTradeUrl);
      if (!validation.valid) {
        console.error('❌ Trade URL невалиден:', validation.error);
      } else {
        console.log('  partnerId:', validation.partnerId);
        console.log('  partnerSteamId64:', validation.partnerSteamId);
        console.log('  token: [присутствует]');
        console.log('✅ Trade URL валиден');
        const botSteamId = profile && profile.steamId ? profile.steamId : null;
        if (botSteamId && validation.partnerSteamId === botSteamId) {
          console.warn('\n⚠️ Внимание: передан Trade URL самого бота (получатель = бот). Для вывода предметов нужна ссылка получателя — другого аккаунта Steam.');
        }
      }
    } else {
      console.log('\n--- Trade URL не передан ---');
      console.log('  Для проверки валидации запустите:');
      console.log('  node scripts/test-steam-trade-bot.js "https://steamcommunity.com/tradeoffer/new/?partner=XXX&token=YYY"');
    }

    // 7. Confirmation checker (автоподтверждение)
    console.log('\n--- Автоподтверждение трейдов ---');
    const confStatus = await bot.getConfirmationCheckerStatus();
    if (confStatus.ready) {
      console.log('✅ Confirmation checker запущен — исходящие трейды будут подтверждаться автоматически');
    } else {
      console.warn('⚠️ Confirmation checker не готов в течение 15 сек (библиотека steamcommunity не всегда эмитит событие).');
      console.log('  После отправки трейда бот вызывает ручное подтверждение (getConfirmations + respond), так что трейды всё равно должны подтверждаться без Steam Mobile.');
    }

    // 8. Тест создания оффера (без отправки)
    if (testTradeUrl) {
      const validation = await bot.validateTradeUrl(testTradeUrl);
      if (validation.valid) {
        console.log('\n--- Тест создания оффера (без отправки) ---');
        const testResult = await bot.testTradeOfferCreation(validation.partnerSteamId);
        if (testResult.error) {
          console.error('❌ Создание оффера:', testResult.error);
        } else {
          console.log('  offerCreated:', testResult.offerCreated);
          console.log('  apiKeySet:', testResult.apiKeySet);
          console.log('✅ Trade Manager готов к созданию офферов');
        }
      }
    }

    console.log('\n=== Проверка завершена ===');
    console.log('Итог: бот авторизован, инвентарь загружен.');
    console.log('Реальную отправку трейда проверяйте через withdrawal-processor или заявку на вывод.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Ошибка:', err.message);
    if (err.message && err.message.includes('Steam Guard')) {
      console.error('   Убедитесь, что STEAM_SHARED_SECRET и STEAM_IDENTITY_SECRET соответствуют Mobile Authenticator аккаунта бота.');
    }
    process.exit(1);
  }
}

main();
