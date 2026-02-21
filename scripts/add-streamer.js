#!/usr/bin/env node
/**
 * Назначить пользователя стримером, создать реферальную ссылку и опционально промокоды.
 *
 * Использование:
 *   node scripts/add-streamer.js <userId>                         — только назначить стримером + одна ссылка
 *   node scripts/add-streamer.js <userId> --promo 3               — стример + ссылка + 3 промокода (value 50)
 *   node scripts/add-streamer.js <userId> --promo STREAM1,STREAM2  — промокоды STREAM1, STREAM2 (value 50)
 *   node scripts/add-streamer.js <userId> --promo CHIBOXGAME:1000 — один промокод CHIBOXGAME на 1000 монет
 *   node scripts/add-streamer.js <userId> --promo A:100,B:500     — несколько с разными суммами
 *
 * Формат промо: CODE или CODE:сумма. По умолчанию сумма 50.
 */

require('dotenv').config();
const db = require('../models');
const crypto = require('crypto');

const args = process.argv.slice(2);
const userId = args[0];
if (!userId) {
  console.error('Использование: node scripts/add-streamer.js <userId> [--promo N | CODE | CODE:сумма]');
  process.exit(1);
}

const promoArg = args.find((a) => a === '--promo') && args[args.indexOf('--promo') + 1];
let promoCount = 0;
/** @type {Array<{ code: string, value: number }>} */
let promoCodesList = [];
if (promoArg) {
  if (/^\d+$/.test(promoArg)) {
    promoCount = parseInt(promoArg, 10);
  } else {
    promoCodesList = promoArg.split(',').map((part) => {
      const t = part.trim().toUpperCase();
      const colon = t.indexOf(':');
      if (colon > 0) {
        const code = t.slice(0, colon);
        const value = parseInt(t.slice(colon + 1), 10);
        return { code, value: Number.isFinite(value) && value > 0 ? value : 50 };
      }
      return { code: t, value: 50 };
    }).filter((x) => x.code);
  }
}

function generateCode() {
  return 'STR' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function main() {
  try {
    const user = await db.User.findByPk(userId);
    if (!user) {
      console.error('Пользователь с id', userId, 'не найден.');
      process.exit(1);
    }

    let streamer = await db.Streamer.findOne({ where: { user_id: userId } });
    if (streamer) {
      console.log('Пользователь уже является стримером:', streamer.id);
    } else {
      streamer = await db.Streamer.create({
        user_id: userId,
        balance: 0,
        percent_from_deposit: 5,
        fixed_registration: 0,
        fixed_first_deposit: 0,
        is_active: true
      });
      console.log('Стример создан:', streamer.id, 'для пользователя', user.username, '(' + userId + ')');
    }

    // Создать одну реферальную ссылку для стримера (если ещё нет)
    const existingLinks = await db.ReferralLink.count({ where: { streamer_id: streamer.id } });
    if (existingLinks === 0) {
      const linkCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      await db.ReferralLink.create({
        streamer_id: streamer.id,
        code: linkCode,
        label: 'Основная'
      });
      const baseUrl = process.env.STREAMER_BASE_URL || 'https://streamer.chibox-game.ru';
      console.log('Реферальная ссылка создана:', baseUrl + '/r/' + linkCode);
    }

    const codesToCreate = promoCodesList.length
      ? promoCodesList
      : Array.from({ length: promoCount }, () => ({ code: generateCode(), value: 50 }));
    if (codesToCreate.length === 0) {
      console.log('Промокоды не запрашивались. Готово.');
      await db.sequelize.close();
      return;
    }

    for (const item of codesToCreate) {
      const code = typeof item === 'string' ? item : item.code;
      const value = typeof item === 'object' && item.value != null ? item.value : 50;
      const existing = await db.PromoCode.findOne({ where: { code } });
      if (existing) {
        console.log('Промокод уже существует:', code);
        continue;
      }
      const promo = await db.PromoCode.create({
        code,
        description: `Промокод стримера ${user.username} — ${value} ChiCoins`,
        type: 'balance_add',
        value,
        is_active: true,
        max_usages: null,
        max_usages_per_user: 1,
        usage_count: 0,
        required_user_type: 'any',
        min_user_level: 0,
        category: 'general',
        streamer_id: streamer.id
      });
      console.log('Создан промокод:', promo.code, '(balance_add', value, 'ChiCoins), streamer_id:', streamer.id);
    }

    console.log('Готово.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
}

main();
