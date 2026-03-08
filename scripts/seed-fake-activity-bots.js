#!/usr/bin/env node
'use strict';

/**
 * Создаёт ботов для фиктивной активности: профиль с Steam-данными, история открытий, достижения, часть предметов продана.
 * Запуск: node scripts/seed-fake-activity-bots.js [количество_ботов]
 * Перед запуском: миграция с is_bot, FAKE_ACTIVITY_ENABLED не обязателен (боты создаются в любом случае).
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const argon2 = require('argon2');
const db = require('../models');
const { runFakeCaseOpen, runBotSellOneItem, getBots } = require('../services/fakeActivityService');
const { recalculateUserAchievements } = require('../controllers/user/recalculateAchievements');
const { updateUserBonuses } = require('../utils/userBonusCalculator');
const { syncUserLevelFromTotalXp } = require('../services/xpService');

const BOTS_AVATARS_DIR = path.join(__dirname, '..', 'public', 'avatars', 'bots');

const BOT_COUNT = Math.min(parseInt(process.argv[2], 10) || 30, 50);
const OPENS_PER_BOT_MIN = 25;
const OPENS_PER_BOT_MAX = 90;
const SELL_PERCENT = 0.25;

// Человеческие ники (игровые, как у обычных пользователей)
const REALISTIC_USERNAMES = [
  'ShadowHunter', 'ProSniper_CS', 'Alexey_G', 'SteelWolf', 'Дмитрий_Д', 'Gamer_X', 'Костя_игрок', 'NightOwl',
  'Vlad_2024', 'Grigory_77', 'Spartan_', 'Max_Power', 'Игорь_К', 'DarkPhoenix', 'Sergey_Play', 'Crimson_',
  'Артём_Геймер', 'Nikolay_S', 'FrostByte', 'Andrey_M', 'Ruslan_CS', 'Evgeniy_Pro', 'Pavel_Open', 'Mikhail_Drop',
  'Denis_Steam', 'Anton_77', 'Viktor_A', 'Oleg_Game', 'Roman_Sniper', 'Ivan_Open', 'Boris_K', 'Timur_CS',
  'StormRider', 'Neo_Matrix', 'CyberWolf', 'Ghost_Killer', 'Phoenix_Rise', 'Tiger_Eye', 'Wolf_Pack', 'Eagle_One',
  'SmoothCriminal', 'Lucky_Seven', 'GoldenHand', 'SilverFox', 'Red_Baron', 'Blue_Storm', 'Green_Light', 'Black_Wolf',
  'Captain_Pro', 'Major_Tom', 'Sergeant_X', 'Private_Open', 'Colonel_S', 'General_G', 'Commander_V', 'Admiral_K',
  'Player_One', 'Gamer_Life', 'Open_King', 'Drop_Master', 'Case_Hunter', 'Skin_Collector', 'Trade_Pro', 'Steam_Lord',
  'Александр_П', 'Михаил_О', 'Евгений_Д', 'Андрей_С', 'Сергей_В', 'Денис_М', 'Алексей_Р', 'Павел_Н',
  'Никита_К', 'Илья_Г', 'Максим_Т', 'Артём_Л', 'Кирилл_Б', 'Даниил_Ч', 'Матвей_Ю', 'Тимофей_Я'
];

// Аватары — разные стили DiceBear по кругу. Только стили, работающие в API 7.x (иначе 404 и битая картинка).
const DICEBEAR_STYLES = [
  'adventurer',
  'avataaars',
  'big-ears',
  'big-smile',
  'bottts',
  'croodles',
  'fun-emoji',
  'identicon',
  'lorelei',
  'notionists',
  'open-peeps',
  'personas',
  'pixel-art',
  'shapes',
  'thumbs'
];
const DICEBEAR_FALLBACK_STYLE = 'adventurer'; // если стиль не загрузился — пробуем этот
const AVATAR_SIZE = 256;

function getAvatarUrlForBot(seed, style) {
  const s = encodeURIComponent(String(seed));
  const styleName = DICEBEAR_STYLES.includes(style) ? style : DICEBEAR_STYLES[0];
  return `https://api.dicebear.com/7.x/${styleName}/png?seed=${s}&size=${AVATAR_SIZE}`;
}

async function downloadBotAvatar(imageUrl, filePath) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${imageUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filePath, buf);
}

function getLocalAvatarPath(userId, ext = 'png') {
  return `/public/avatars/bots/${userId}.${ext}`;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function createBots() {
  fs.mkdirSync(BOTS_AVATARS_DIR, { recursive: true });

  const passwordHash = await argon2.hash('FakeBotPassword1!', { type: argon2.argon2id });
  const created = [];
  const baseSteamId = '76561198';

  const namesPool = shuffle(REALISTIC_USERNAMES);
  const existingUsernames = new Set(
    (await db.User.findAll({ attributes: ['username'] })).map((u) => u.username)
  );

  for (let i = 1; i <= BOT_COUNT; i++) {
    let username = namesPool[(i - 1) % namesPool.length];
    while (existingUsernames.has(username)) {
      username = `${username}_${i}`;
    }
    existingUsernames.add(username);

    const email = `bot.fake.${i}@chibox.local`;
    const steamId = baseSteamId + String(i).padStart(9, '0');
    const avatarStyle = DICEBEAR_STYLES[(i - 1) % DICEBEAR_STYLES.length];
    const defaultAvatarUrl = getAvatarUrlForBot(i, avatarStyle);

    const defaults = {
      email,
      username,
      password: passwordHash,
      role: 'user',
      is_bot: true,
      is_active: true,
      auth_provider: 'steam',
      steam_id: steamId,
      steam_profile: {
        personaname: username,
        profileurl: `https://steamcommunity.com/profiles/${steamId}`,
        avatar: defaultAvatarUrl,
        avatarfull: defaultAvatarUrl
      },
      steam_avatar_url: defaultAvatarUrl,
      steam_profile_url: `https://steamcommunity.com/profiles/${steamId}`,
      level: 1,
      xp: 0,
      xp_to_next_level: 100,
      total_xp_earned: 0,
      total_cases_opened: 0,
      best_item_value: 0,
      total_items_value: 0,
      daily_streak: randomInt(0, 5),
      max_daily_streak: randomInt(2, 10),
      subscription_tier: pick([0, 0, 0, 1, 1, 2]),
      balance: 0,
      createdAt: new Date(Date.now() - randomInt(7, 90) * 24 * 60 * 60 * 1000)
    };

    const [user, wasCreated] = await db.User.findOrCreate({
      where: { email },
      defaults
    });

    const localAvatarPath = getLocalAvatarPath(user.id);
    const localFilePath = path.join(BOTS_AVATARS_DIR, `${user.id}.png`);
    let avatarUrl = getAvatarUrlForBot(user.id, avatarStyle);

    try {
      await downloadBotAvatar(avatarUrl, localFilePath);
      await user.update({
        username,
        steam_avatar_url: localAvatarPath,
        steam_profile: {
          personaname: username,
          profileurl: `https://steamcommunity.com/profiles/${steamId}`,
          avatar: localAvatarPath,
          avatarfull: localAvatarPath
        }
      });
    } catch (e) {
      const fallbackUrl = getAvatarUrlForBot(user.id, DICEBEAR_FALLBACK_STYLE);
      try {
        await downloadBotAvatar(fallbackUrl, localFilePath);
        await user.update({
          username,
          steam_avatar_url: localAvatarPath,
          steam_profile: {
            personaname: username,
            profileurl: `https://steamcommunity.com/profiles/${steamId}`,
            avatar: localAvatarPath,
            avatarfull: localAvatarPath
          }
        });
        console.warn(`  Бот ${i}: стиль ${avatarStyle} не загрузился, сохранён fallback (adventurer)`);
      } catch (e2) {
        await user.update({
          username,
          steam_avatar_url: fallbackUrl,
          steam_profile: {
            personaname: username,
            profileurl: `https://steamcommunity.com/profiles/${steamId}`,
            avatar: fallbackUrl,
            avatarfull: fallbackUrl
          }
        });
        console.warn(`  Бот ${i}: аватар по URL (${e2.message})`);
      }
    }

    if (user) created.push(user);
    console.log(`  Бот ${i}/${BOT_COUNT}: ${username} (Steam ID ${steamId})`);
  }

  return created;
}

async function fillBotHistory() {
  const bots = await getBots();
  if (!bots.length) {
    console.log('Нет ботов для заполнения истории.');
    return;
  }

  const totalOpens = bots.length * randomInt(OPENS_PER_BOT_MIN, OPENS_PER_BOT_MAX);
  console.log(`Симуляция открытий кейсов (всего ~${totalOpens})...`);

  for (let i = 0; i < totalOpens; i++) {
    await runFakeCaseOpen();
    if (i % 20 === 0 && i > 0) process.stdout.write('.');
  }
  console.log(' OK');
}

async function sellSomeBotItems() {
  const bots = await getBots();
  const targetSells = Math.max(30, Math.floor(bots.length * 15 * SELL_PERCENT));

  console.log(`Симуляция продаж предметов ботов (цель ~${targetSells})...`);
  for (let i = 0; i < targetSells; i++) {
    await runBotSellOneItem();
    if (i % 10 === 0 && i > 0) process.stdout.write('.');
  }
  console.log(' OK');
}

/** Синхронизирует уровень и XP ботов по количеству открытых кейсов (уровень = от активности). */
async function syncBotLevelsFromCases() {
  const bots = await getBots();
  if (!bots.length) return;
  console.log(`Синхронизация уровня по открытиям для ${bots.length} ботов...`);
  for (const bot of bots) {
    try {
      const totalCases = bot.total_cases_opened || 0;
      const totalXp = totalCases * 10; // 10 XP за открытие, как у обычных пользователей
      await syncUserLevelFromTotalXp(bot.id, totalXp);
    } catch (e) {
      console.warn(`  Предупреждение для бота ${bot.username}:`, e.message);
    }
  }
  console.log(' OK');
}

const XP_PER_CASE = 10; // как у обычных пользователей при открытии кейса

/**
 * Приводит уровень и XP ботов в соответствие с total_cases_opened (правдоподобная статистика).
 */
async function syncBotLevelsFromStats() {
  const bots = await getBots();
  if (!bots.length) return;

  const levelSettings = await db.LevelSettings.findAll({ order: [['level', 'ASC']] });
  if (!levelSettings.length) {
    console.warn('  LevelSettings пуст — уровень ботов не пересчитан.');
    return;
  }

  console.log(`Синхронизация уровня/XP с открытиями кейсов для ${bots.length} ботов...`);
  for (const bot of bots) {
    const user = await db.User.findByPk(bot.id, {
      attributes: ['id', 'username', 'level', 'xp', 'total_cases_opened', 'total_xp_earned', 'xp_to_next_level']
    });
    if (!user) continue;

    const totalXp = (user.total_cases_opened || 0) * XP_PER_CASE;
    let level = 1;
    let xpToNext = levelSettings[0]?.xp_to_next_level ?? 100;

    for (const ls of levelSettings) {
      if (totalXp >= ls.xp_required) {
        level = ls.level;
        xpToNext = ls.xp_to_next_level;
      } else break;
    }

    await user.update({
      xp: totalXp,
      total_xp_earned: totalXp,
      level,
      xp_to_next_level: xpToNext
    });
  }
  console.log(' OK');
}

async function recalculateBotBonusesAndAchievements() {
  const bots = await getBots();
  console.log(`Пересчёт бонусов и достижений для ${bots.length} ботов...`);
  for (const bot of bots) {
    try {
      await updateUserBonuses(bot.id);
      await recalculateUserAchievements(bot.id);
    } catch (e) {
      console.warn(`  Предупреждение для бота ${bot.username}:`, e.message);
    }
  }
  console.log(' OK');
}

async function main() {
  console.log('=== Сид фиктивной активности (боты) ===\n');

  try {
    await db.sequelize.authenticate();
    process.env.FAKE_ACTIVITY_ENABLED = 'true';
  } catch (e) {
    console.error('Ошибка подключения к БД:', e.message);
    process.exit(1);
  }

  console.log(`Создание ${BOT_COUNT} ботов (Steam-профиль, без входа)...`);
  await createBots();

  console.log('\nЗаполнение истории открытий кейсов...');
  await fillBotHistory();

  console.log('\nПометить часть предметов как проданные...');
  await sellSomeBotItems();

  console.log('\nСинхронизация уровня и XP с количеством открытий...');
  await syncBotLevelsFromStats();

  console.log('\nПересчёт достижений и бонусов ботов...');
  await recalculateBotBonusesAndAchievements();

  console.log('\nГотово. Включите FAKE_ACTIVITY_ENABLED=true и перезапустите сервер для таймера дропов и фейкового онлайна.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
