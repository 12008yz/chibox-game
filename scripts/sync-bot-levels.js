#!/usr/bin/env node
'use strict';

/**
 * Приводит уровень и XP ботов в соответствие с total_cases_opened (для уже созданных ботов).
 * Запуск: node scripts/sync-bot-levels.js
 */

require('dotenv').config();
const db = require('../models');
const { getBots } = require('../services/fakeActivityService');

const XP_PER_CASE = 10;

async function main() {
  await db.sequelize.authenticate();
  const bots = await getBots();
  if (!bots.length) {
    console.log('В БД нет ботов.');
    process.exit(0);
  }

  const levelSettings = await db.LevelSettings.findAll({ order: [['level', 'ASC']] });
  if (!levelSettings.length) {
    console.error('LevelSettings пуст. Выполните сидер уровней.');
    process.exit(1);
  }

  console.log(`Синхронизация уровня/XP для ${bots.length} ботов...`);
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
    console.log(`  ${user.username}: открытий ${user.total_cases_opened} → уровень ${level}, XP ${totalXp}`);
  }
  console.log('Готово.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
