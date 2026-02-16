#!/usr/bin/env node

/**
 * Обнуление статистики и прогресса пользователя (чистый аккаунт).
 *
 * Что делает:
 * - Обнуляет баланс, XP, уровень, подписку, счётчики кейсов/бонусов/игр
 * - Удаляет весь инвентарь пользователя
 * - Отменяет активные выводы (предметы возвращаются в инвентарь, затем инвентарь очищается)
 * - Удаляет прогресс достижений, миссий, открытые кейсы, записи лидерборда, уведомления
 * - Удаляет записи мини-игр (Tower Defense, TicTacToe, BonusMiniGame, LiveDrop и т.д.)
 *
 * НЕ трогает: логин/пароль, email, Steam, роль, бан, дату регистрации, транзакции, платежи, историю подписок.
 *
 * Запуск:
 *   node scripts/reset-user-stats.js <USER_ID>                    # dry-run (показать, что будет сделано)
 *   node scripts/reset-user-stats.js e0d82dfd-c10a-4415-a958-7f9b96ef2a84 --confirm            # выполнить сброс
 *   node scripts/reset-user-stats.js <ID1> <ID2> <ID3> --confirm    # несколько пользователей
 *
 * USER_ID — UUID пользователя (из таблицы users).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../models');
const {
  User,
  UserInventory,
  Withdrawal,
  UserAchievement,
  UserMission,
  Case,
  CaseItemDrop,
  UserUnlockableContent,
  LeaderboardEntry,
  Notification,
  LiveDrop,
  TowerDefenseGame,
  TicTacToeGame,
  BonusMiniGameHistory
} = db;
const { Op } = require('sequelize');

const CONFIRM = process.argv.includes('--confirm');
const userIds = process.argv.filter(a => a !== '--confirm' && /^[0-9a-f-]{36}$/i.test(a));

const TERMINAL_WITHDRAWAL_STATUSES = ['completed', 'failed', 'cancelled', 'rejected', 'expired'];

// Поля пользователя, которые обнуляем к дефолтным значениям
const USER_RESET_FIELDS = {
  balance: 0,
  level: 1,
  xp: 0,
  xp_to_next_level: 100,
  total_xp_earned: 0,
  level_bonus_percentage: 0,
  achievements_bonus_percentage: 0,
  drop_rate_modifier: 1,

  subscription_tier: 0,
  subscription_purchase_date: null,
  subscription_expiry_date: null,
  subscription_days_left: 0,

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

async function resetOneUser(userId) {
  const user = await User.findByPk(userId, { attributes: ['id', 'username', 'email', 'balance', 'xp', 'level'] });
  if (!user) {
    console.log(`  ❌ Пользователь не найден: ${userId}`);
    return false;
  }

  const invCount = await UserInventory.count({ where: { user_id: userId } });
  const activeWithdrawals = await Withdrawal.count({
    where: { user_id: userId, status: { [Op.notIn]: TERMINAL_WITHDRAWAL_STATUSES } }
  });
  const achievementsCount = await UserAchievement.count({ where: { user_id: userId } });
  const missionsCount = await UserMission.count({ where: { user_id: userId } });
  const casesCount = await Case.count({ where: { user_id: userId } });
  const notificationsCount = await Notification.count({ where: { user_id: userId } });

  console.log(`  Пользователь: ${user.username} (${user.email})`);
  console.log(`  Баланс: ${user.balance}, Уровень: ${user.level}, XP: ${user.xp}`);
  console.log(`  Инвентарь: ${invCount} записей`);
  console.log(`  Активных выводов: ${activeWithdrawals}`);
  console.log(`  Достижения: ${achievementsCount}, Миссии: ${missionsCount}, Кейсы: ${casesCount}, Уведомления: ${notificationsCount}`);

  if (!CONFIRM) {
    console.log('  [DRY-RUN] Выполните с --confirm для применения.\n');
    return true;
  }

  const t = await db.sequelize.transaction();
  const step = (name, fn) => fn().catch((err) => {
    console.error(`  ❌ Шаг "${name}":`, err.message);
    if (err.original && err.original.message) console.error('  SQL/DB:', err.original.message);
    throw err;
  });

  try {
    await step('Активные выводы', async () => {
      const withdrawals = await Withdrawal.findAll({
        where: { user_id: userId, status: { [Op.notIn]: TERMINAL_WITHDRAWAL_STATUSES } },
        transaction: t
      });
      for (const w of withdrawals) {
        await UserInventory.update(
          { status: 'inventory', withdrawal_id: null, transaction_date: null },
          { where: { withdrawal_id: w.id }, transaction: t }
        );
        await w.update({
          status: 'cancelled',
          cancellation_reason: 'Обнуление аккаунта (скрипт reset-user-stats)',
          cancellation_date: new Date()
        }, { transaction: t });
      }
    });

    await step('Удаление инвентаря', () =>
      UserInventory.destroy({ where: { user_id: userId }, transaction: t }));

    await step('Withdrawal.notification_id = null', () =>
      Withdrawal.update(
        { notification_id: null },
        { where: { user_id: userId }, transaction: t }
      ));

    await step('CaseItemDrop', () =>
      CaseItemDrop.destroy({ where: { user_id: userId }, transaction: t }));
    // LiveDrop имеет case_id → Case, удаляем до Case
    await step('LiveDrop', () =>
      LiveDrop.destroy({ where: { user_id: userId }, transaction: t }));
    await step('Case', () =>
      Case.destroy({ where: { user_id: userId }, transaction: t }));
    await step('UserAchievement', () =>
      UserAchievement.destroy({ where: { user_id: userId }, transaction: t }));
    await step('UserMission', () =>
      UserMission.destroy({ where: { user_id: userId }, transaction: t }));
    await step('UserUnlockableContent', () =>
      UserUnlockableContent.destroy({ where: { user_id: userId }, transaction: t }));
    await step('LeaderboardEntry', () =>
      LeaderboardEntry.destroy({ where: { user_id: userId }, transaction: t }));
    await step('Notification', () =>
      Notification.destroy({ where: { user_id: userId }, transaction: t }));
    if (TowerDefenseGame) {
      await step('TowerDefenseGame', () =>
        TowerDefenseGame.destroy({ where: { user_id: userId }, transaction: t }));
    }
    if (TicTacToeGame) {
      await step('TicTacToeGame', () =>
        TicTacToeGame.destroy({ where: { user_id: userId }, transaction: t }));
    }
    if (BonusMiniGameHistory) {
      await step('BonusMiniGameHistory', () =>
        BonusMiniGameHistory.destroy({ where: { user_id: userId }, transaction: t }));
    }

    await step('User update (обнуление полей)', () =>
      user.update(USER_RESET_FIELDS, { transaction: t }));

    await t.commit();
    console.log(`  ✅ Аккаунт обнулён: ${user.username}\n`);
    return true;
  } catch (err) {
    await t.rollback();
    return false;
  }
}

async function main() {
  console.log('=== Обнуление статистики пользователя(ей) ===\n');
  if (userIds.length === 0) {
    console.log('Использование: node scripts/reset-user-stats.js <USER_UUID> [USER_UUID2 ...] [--confirm]');
    console.log('Пример:       node scripts/reset-user-stats.js 550e8400-e29b-41d4-a716-446655440000 --confirm');
    process.exit(1);
  }
  if (!CONFIRM) {
    console.log('Режим DRY-RUN. Для выполнения добавьте --confirm\n');
  }

  let ok = 0;
  for (const id of userIds) {
    console.log(`--- ${id} ---`);
    const success = await resetOneUser(id);
    if (success) ok++;
  }

  console.log(`Готово: ${ok}/${userIds.length} пользователей.`);
  process.exit(ok === userIds.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
