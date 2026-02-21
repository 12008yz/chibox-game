#!/usr/bin/env node
/**
 * Проверить и обновить процент с депозита для стримера(ов).
 *
 * Использование:
 *   node scripts/check-streamer-percent.js                    — показать всех стримеров и их проценты
 *   node scripts/check-streamer-percent.js <streamerId|userId> — показать процент (поиск по streamer.id или user_id)
 *   node scripts/check-streamer-percent.js <streamerId|userId> --set 10 — установить процент
 *   node scripts/check-streamer-percent.js --all-to-10        — установить 10% всем стримерам
 */

require('dotenv').config();
const db = require('../models');

const args = process.argv.slice(2);
const streamerId = args[0];
const setPercent = args.find((a) => a === '--set') && args[args.indexOf('--set') + 1];
const allTo10 = args.includes('--all-to-10');

async function main() {
  try {
    if (allTo10) {
      const [updated] = await db.Streamer.update(
        { percent_from_deposit: 10 },
        { where: {} }
      );
      console.log(`Обновлено стримеров: ${updated}`);
      const streamers = await db.Streamer.findAll({
        include: [{ model: db.User, as: 'user', attributes: ['id', 'username'] }],
        order: [['created_at', 'DESC']]
      });
      console.log('\nВсе стримеры (после обновления):');
      for (const s of streamers) {
        console.log(`  ${s.id} | ${s.user?.username || 'N/A'} | ${s.percent_from_deposit}%`);
      }
      await db.sequelize.close();
      return;
    }

    if (streamerId && setPercent) {
      const percent = parseFloat(setPercent);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        console.error('Процент должен быть числом от 0 до 100');
        process.exit(1);
      }
      // Сначала ищем по streamer.id, если не найдено - по user_id
      let streamer = await db.Streamer.findByPk(streamerId, {
        include: [{ model: db.User, as: 'user', attributes: ['id', 'username'] }]
      });
      if (!streamer) {
        streamer = await db.Streamer.findOne({
          where: { user_id: streamerId },
          include: [{ model: db.User, as: 'user', attributes: ['id', 'username'] }]
        });
      }
      if (!streamer) {
        console.error('Стример не найден по streamerId или userId:', streamerId);
        process.exit(1);
      }
      const oldPercent = streamer.percent_from_deposit;
      await streamer.update({ percent_from_deposit: percent });
      console.log(`Streamer ID: ${streamer.id}`);
      console.log(`User ID: ${streamer.user_id} (${streamer.user?.username || 'N/A'})`);
      console.log(`Процент изменён: ${oldPercent}% → ${percent}%`);
      await db.sequelize.close();
      return;
    }

    if (streamerId) {
      // Сначала ищем по streamer.id, если не найдено - по user_id
      let streamer = await db.Streamer.findByPk(streamerId, {
        include: [{ model: db.User, as: 'user', attributes: ['id', 'username'] }]
      });
      if (!streamer) {
        streamer = await db.Streamer.findOne({
          where: { user_id: streamerId },
          include: [{ model: db.User, as: 'user', attributes: ['id', 'username'] }]
        });
      }
      if (!streamer) {
        console.error('Стример не найден по streamerId или userId:', streamerId);
        process.exit(1);
      }
      console.log(`Streamer ID: ${streamer.id}`);
      console.log(`User ID: ${streamer.user_id} (${streamer.user?.username || 'N/A'})`);
      console.log(`Процент с депозита: ${streamer.percent_from_deposit}%`);
      await db.sequelize.close();
      return;
    }

    // Показать всех стримеров
    const streamers = await db.Streamer.findAll({
      include: [{ model: db.User, as: 'user', attributes: ['id', 'username'] }],
      order: [['created_at', 'DESC']]
    });
    if (streamers.length === 0) {
      console.log('Стримеров не найдено.');
    } else {
      console.log(`Найдено стримеров: ${streamers.length}\n`);
      for (const s of streamers) {
        console.log(`  ${s.id}`);
        console.log(`    Пользователь: ${s.user?.username || 'N/A'} (${s.user?.id || 'N/A'})`);
        console.log(`    Процент с депозита: ${s.percent_from_deposit}%`);
        console.log(`    Фикс за регистрацию: ${s.fixed_registration}`);
        console.log(`    Фикс за первый депозит: ${s.fixed_first_deposit}`);
        console.log(`    Баланс: ${s.balance}`);
        console.log(`    Активен: ${s.is_active ? 'Да' : 'Нет'}`);
        console.log('');
      }
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
}

main();
