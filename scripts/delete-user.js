#!/usr/bin/env node

/**
 * Полное удаление пользователя из БД (все связанные данные + запись в users).
 * Либо очистка только инвентаря у всех пользователей, либо обнуление прогресса/баланса у всех.
 *
 * Запуск:
 *   node scripts/delete-user.js <USER_ID> [--confirm]   # удалить пользователя (dry-run без --confirm)
 *   node scripts/delete-user.js --bots [--confirm]      # удалить ВСЕХ ботов (is_bot=true) и их данные
 *   node scripts/delete-user.js --inv [--confirm]       # очистить инвентарь у ВСЕХ пользователей
 *   node scripts/delete-user.js --zero [--confirm]      # обнулить баланс, подписку, XP и игровой прогресс у ВСЕХ
 *
 * USER_ID — UUID пользователя (из таблицы users).
 * --inv  — очистить только таблицу user_inventory у всех пользователей.
 * --zero — обнулить у всех: balance, xp, подписка, кейсы, бонусы, рулетка, игры, достижения (user_achievements). Логины не трогаем.
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BOTS_AVATARS_DIR = path.join(__dirname, '..', 'public', 'avatars', 'bots');

const db = require('../models');
const {
  User,
  UserInventory,
  Withdrawal,
  Notification,
  UserAchievement,
  UserMission,
  Case,
  CaseItemDrop,
  UserUnlockableContent,
  LeaderboardEntry,
  LiveDrop,
  Payment,
  Transaction,
  XpTransaction,
  PromoCodeUser,
  PromoCodeUsage,
  SubscriptionHistory,
  BonusMiniGameHistory,
  TowerDefenseGame,
  TicTacToeGame,
  Streamer
} = db;

const CONFIRM = process.argv.includes('--confirm');
const BOTS_ONLY = process.argv.includes('--bots');
const INV_ONLY = process.argv.includes('--inv');
const ZERO_ALL = process.argv.includes('--zero');
const userIds = process.argv.filter(
  (a) => a !== '--confirm' && a !== '--bots' && a !== '--inv' && a !== '--zero' && /^[0-9a-f-]{36}$/i.test(a)
);

async function deleteOneUser(userId) {
  const user = await User.findByPk(userId, {
    attributes: ['id', 'username', 'email', 'steam_id']
  });
  if (!user) {
    console.log(`  ❌ Пользователь не найден: ${userId}`);
    return false;
  }

  const invCount = await UserInventory.count({ where: { user_id: userId } });
  const withdrawalsCount = await Withdrawal.count({ where: { user_id: userId } });
  const paymentsCount = await Payment.count({ where: { user_id: userId } });
  const streamer = await Streamer.findOne({ where: { user_id: userId }, attributes: ['id'] });

  console.log(`  Пользователь: ${user.username} (${user.email || '—'}) steam_id: ${user.steam_id || '—'}`);
  console.log(`  Инвентарь: ${invCount}, Выводы: ${withdrawalsCount}, Платежи: ${paymentsCount}`);
  if (streamer) console.log(`  Стример: да (кабинет и ссылки удалятся по CASCADE)`);

  if (!CONFIRM) {
    console.log('  [DRY-RUN] Для выполнения добавьте --confirm\n');
    return true;
  }

  const t = await db.sequelize.transaction();
  const step = (name, fn) =>
    fn().catch((err) => {
      console.error(`  ❌ ${name}:`, err.message);
      if (err.original && err.original.message) console.error('  DB:', err.original.message);
      throw err;
    });

  try {
    await step('Withdrawal: обнулить notification_id', () =>
      Withdrawal.update({ notification_id: null }, { where: { user_id: userId }, transaction: t }));

    await step('Notification', () => Notification.destroy({ where: { user_id: userId }, transaction: t }));
    await step('UserInventory', () => UserInventory.destroy({ where: { user_id: userId }, transaction: t }));
    await step('Withdrawal', () => Withdrawal.destroy({ where: { user_id: userId }, transaction: t }));
    await step('CaseItemDrop', () => CaseItemDrop.destroy({ where: { user_id: userId }, transaction: t }));
    await step('LiveDrop', () => LiveDrop.destroy({ where: { user_id: userId }, transaction: t }));
    await step('Case', () => Case.destroy({ where: { user_id: userId }, transaction: t }));
    await step('UserAchievement', () => UserAchievement.destroy({ where: { user_id: userId }, transaction: t }));
    await step('UserMission', () => UserMission.destroy({ where: { user_id: userId }, transaction: t }));
    await step('UserUnlockableContent', () =>
      UserUnlockableContent.destroy({ where: { user_id: userId }, transaction: t }));
    await step('LeaderboardEntry', () => LeaderboardEntry.destroy({ where: { user_id: userId }, transaction: t }));
    await step('Payment', () => Payment.destroy({ where: { user_id: userId }, transaction: t }));
    await step('Transaction', () => Transaction.destroy({ where: { user_id: userId }, transaction: t }));
    await step('XpTransaction', () => XpTransaction.destroy({ where: { user_id: userId }, transaction: t }));
    await step('PromoCodeUser', () => PromoCodeUser.destroy({ where: { user_id: userId }, transaction: t }));
    await step('PromoCodeUsage', () => PromoCodeUsage.destroy({ where: { user_id: userId }, transaction: t }));
    await step('SubscriptionHistory', () =>
      SubscriptionHistory.destroy({ where: { user_id: userId }, transaction: t }));
    if (BonusMiniGameHistory) {
      await step('BonusMiniGameHistory', () =>
        BonusMiniGameHistory.destroy({ where: { user_id: userId }, transaction: t }));
    }
    if (TowerDefenseGame) {
      await step('TowerDefenseGame', () => TowerDefenseGame.destroy({ where: { user_id: userId }, transaction: t }));
    }
    if (TicTacToeGame) {
      await step('TicTacToeGame', () => TicTacToeGame.destroy({ where: { user_id: userId }, transaction: t }));
    }

    await step('Streamer (кабинет стримера)', () =>
      Streamer.destroy({ where: { user_id: userId }, transaction: t }));

    await step('User', () => User.destroy({ where: { id: userId }, transaction: t }));

    await t.commit();
    console.log(`  ✅ Пользователь полностью удалён: ${user.username}\n`);
    return true;
  } catch (err) {
    await t.rollback();
    return false;
  }
}

async function deleteAllBots() {
  const bots = await User.findAll({
    where: { is_bot: true },
    attributes: ['id', 'username', 'email']
  });
  if (bots.length === 0) {
    console.log('Ботов не найдено (is_bot=true).');
    return true;
  }
  console.log(`Найдено ботов: ${bots.length}`);
  if (!CONFIRM) {
    console.log('[DRY-RUN] Для удаления добавьте --confirm\n');
    return true;
  }
  let ok = 0;
  for (const bot of bots) {
    console.log(`--- ${bot.username} (${bot.email}) ---`);
    const success = await deleteOneUser(bot.id);
    if (success) {
      ok++;
      const avatarPath = path.join(BOTS_AVATARS_DIR, `${bot.id}.png`);
      try {
        if (fs.existsSync(avatarPath)) {
          fs.unlinkSync(avatarPath);
          console.log(`  Аватар удалён: ${avatarPath}`);
        }
      } catch (e) {
        console.warn('  Аватар не удалён:', e.message);
      }
    }
  }
  console.log(`\nУдалено ботов: ${ok}/${bots.length}.`);
  return ok === bots.length;
}

async function clearAllInventories() {
  const total = await UserInventory.count();
  console.log(`Найдено записей в инвентаре (user_inventory): ${total}`);
  if (total === 0) {
    console.log('Нечего удалять.');
    return true;
  }
  if (!CONFIRM) {
    console.log('[DRY-RUN] Для выполнения очистки добавьте --confirm');
    return true;
  }
  const t = await db.sequelize.transaction();
  try {
    await UserInventory.destroy({ where: {}, transaction: t });
    await t.commit();
    console.log(`✅ Удалено записей инвентаря: ${total}`);
    return true;
  } catch (err) {
    await t.rollback();
    console.error('❌ Ошибка:', err.message);
    return false;
  }
}

/** Обнуление баланса, подписки, XP и игрового прогресса у всех пользователей (учётки не трогаем). */
const ZERO_USER_FIELDS = {
  balance: 0,
  xp: 0,
  level: 1,
  xp_to_next_level: 100,
  level_bonus_percentage: 0,
  total_xp_earned: 0,
  subscription_tier: 0,
  subscription_purchase_date: null,
  subscription_expiry_date: null,
  subscription_days_left: 0,
  subscription_bonus_percentage: 0,
  total_drop_bonus_percentage: 0,
  achievements_bonus_percentage: 0,
  cases_available: 0,
  cases_opened_today: 0,
  total_cases_opened: 0,
  next_case_available_time: null,
  paid_cases_bought_today: 0,
  max_daily_cases: 0,
  last_reset_date: null,
  next_bonus_available_time: null,
  last_bonus_date: null,
  lifetime_bonuses_claimed: 0,
  successful_bonus_claims: 0,
  last_roulette_play: null,
  roulette_attempts_left: 0,
  last_roulette_reset: null,
  tictactoe_attempts_left: 0,
  last_tictactoe_reset: null,
  slots_played_today: 0,
  last_slot_reset_date: null,
  game_attempts: 3,
  last_safecracker_reset: null,
  has_won_safecracker: false,
  free_case_claim_count: 0,
  free_case_first_claim_date: null,
  free_case_last_claim_date: null,
  free_safecracker_claim_count: 0,
  free_safecracker_first_claim_date: null,
  free_safecracker_last_claim_date: null,
  free_slot_claim_count: 0,
  free_slot_first_claim_date: null,
  free_slot_last_claim_date: null,
  free_tictactoe_claim_count: 0,
  free_tictactoe_first_claim_date: null,
  free_tictactoe_last_claim_date: null,
  total_items_value: 0,
  best_item_value: 0,
  daily_streak: 0,
  max_daily_streak: 0
};

async function zeroAllUsers() {
  const count = await User.count();
  console.log(`Пользователей в БД: ${count}`);
  if (count === 0) {
    console.log('Нечего обнулять.');
    return true;
  }
  const achievementsCount = await UserAchievement.count();
  console.log('Будут обнулены: balance, xp, подписка, кейсы, бонусы, рулетка, мини-игры, статистика.');
  console.log(`Достижения (user_achievements): удалить все записи (${achievementsCount}).`);
  if (!CONFIRM) {
    console.log('[DRY-RUN] Для выполнения обнуления добавьте --confirm');
    return true;
  }
  const t = await db.sequelize.transaction();
  try {
    await UserAchievement.destroy({ where: {}, transaction: t });
    const [affected] = await User.update(ZERO_USER_FIELDS, { where: {}, transaction: t });
    await t.commit();
    console.log(`✅ Достижения удалены: ${achievementsCount}, обнулено пользователей: ${affected}`);
    return true;
  } catch (err) {
    await t.rollback();
    console.error('❌ Ошибка:', err.message);
    return false;
  }
}

async function main() {
  if (BOTS_ONLY) {
    console.log('=== Удаление всех ботов (is_bot=true) ===\n');
    const success = await deleteAllBots();
    process.exit(success ? 0 : 1);
  }
  if (INV_ONLY) {
    console.log('=== Очистка инвентаря всех пользователей ===\n');
    const success = await clearAllInventories();
    process.exit(success ? 0 : 1);
  }
  if (ZERO_ALL) {
    console.log('=== Обнуление всех пользователей (баланс, подписка, XP, прогресс) ===\n');
    const success = await zeroAllUsers();
    process.exit(success ? 0 : 1);
  }

  console.log('=== Полное удаление пользователя(ей) ===\n');
  if (userIds.length === 0) {
    console.log('Использование:');
    console.log('  node scripts/delete-user.js <USER_UUID> [--confirm]');
    console.log('  node scripts/delete-user.js --bots [--confirm]  # удалить всех ботов');
    console.log('  node scripts/delete-user.js --inv [--confirm]   # очистить инвентарь у всех');
    console.log('  node scripts/delete-user.js --zero [--confirm]  # обнулить прогресс у всех');
    console.log('Пример:       node scripts/delete-user.js 550e8400-e29b-41d4-a716-446655440000 --confirm');
    process.exit(1);
  }
  if (!CONFIRM) {
    console.log('Режим DRY-RUN. Для выполнения добавьте --confirm\n');
  }

  let ok = 0;
  for (const id of userIds) {
    console.log(`--- ${id} ---`);
    const success = await deleteOneUser(id);
    if (success) ok++;
  }

  console.log(`Готово: ${ok}/${userIds.length}.`);
  process.exit(ok === userIds.length ? 0 : 1);
}

main()
  .then(() => {
    db.sequelize.close();
  })
  .catch((err) => {
    console.error(err);
    db.sequelize.close();
    process.exit(1);
  });
