#!/usr/bin/env node

/**
 * Полное удаление пользователя из БД (все связанные данные + запись в users).
 *
 * Запуск:
 *   node scripts/delete-user.js <USER_ID>              # dry-run
 *   node scripts/delete-user.js <USER_ID> --confirm     # выполнить удаление
 *
 * USER_ID — UUID пользователя (из таблицы users).
 * Удаляются все связанные данные; запись стримера (если есть) удаляется до пользователя (CASCADE очистит ссылки, начисления, выводы стримера).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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
const userIds = process.argv.filter((a) => a !== '--confirm' && /^[0-9a-f-]{36}$/i.test(a));

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

async function main() {
  console.log('=== Полное удаление пользователя(ей) ===\n');
  if (userIds.length === 0) {
    console.log('Использование: node scripts/delete-user.js <USER_UUID> [--confirm]');
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
