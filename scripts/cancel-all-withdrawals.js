#!/usr/bin/env node

/**
 * Отмена всех активных выводов на проде.
 *
 * Что делает:
 * - Находит все выводы со статусом не завершённым (не completed/failed/cancelled/rejected/expired)
 * - Возвращает привязанные предметы в инвентарь (withdrawal_id = null, status = 'inventory')
 * - Ставит выводу статус 'cancelled', cancellation_reason, cancellation_date
 *
 * Запуск:
 *   node scripts/cancel-all-withdrawals.js              # только показать, что будет отменено (dry-run)
 *   node scripts/cancel-all-withdrawals.js --confirm    # выполнить отмену
 *
 * Рекомендация: сначала запустить без --confirm, проверить вывод, затем с --confirm на проде.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Withdrawal, UserInventory, Item, User } = require('../models');

const CONFIRM = process.argv.includes('--confirm');

const TERMINAL_STATUSES = ['completed', 'failed', 'cancelled', 'rejected', 'expired'];

async function main() {
  console.log('=== Отмена всех активных выводов ===\n');
  if (!CONFIRM) {
    console.log('Режим DRY-RUN (ничего не меняем). Для выполнения добавьте --confirm\n');
  }

  const { Op } = require('sequelize');

  const active = await Withdrawal.findAll({
    where: {
      status: { [Op.notIn]: TERMINAL_STATUSES }
    },
    include: [
      {
        model: UserInventory,
        as: 'items',
        include: [{ model: Item, as: 'item', attributes: ['id', 'name'] }]
      },
      { model: User, as: 'user', attributes: ['id', 'username'] }
    ],
    order: [['request_date', 'ASC']]
  });

  if (active.length === 0) {
    console.log('Нет активных выводов для отмены.');
    process.exit(0);
  }

  console.log(`Найдено активных выводов: ${active.length}\n`);

  for (const w of active) {
    const itemNames = (w.items || []).map(i => i.item?.name || i.id).join(', ');
    console.log(`  ${w.id} | user: ${w.user?.username || w.user_id} | status: ${w.status} | items: ${(w.items || []).length} (${itemNames || '—'})`);
  }

  if (!CONFIRM) {
    console.log('\nЗапустите с --confirm для выполнения отмены.');
    process.exit(0);
  }

  console.log('\nВыполняю отмену...\n');

  let done = 0;
  let errors = 0;

  for (const withdrawal of active) {
    const t = await Withdrawal.sequelize.transaction();
    try {
      if (withdrawal.items && withdrawal.items.length > 0) {
        for (const inv of withdrawal.items) {
          await inv.update(
            { status: 'inventory', withdrawal_id: null, transaction_date: new Date() },
            { transaction: t }
          );
        }
        console.log(`  [${withdrawal.id}] возвращено в инвентарь: ${withdrawal.items.length} предмет(ов)`);
      }

      await withdrawal.update(
        {
          status: 'cancelled',
          cancellation_reason: 'Массовая отмена администратором (скрипт cancel-all-withdrawals)',
          cancellation_date: new Date(),
          completion_date: new Date()
        },
        { transaction: t }
      );

      await t.commit();
      done++;
    } catch (err) {
      await t.rollback().catch(() => {});
      console.error(`  [${withdrawal.id}] ошибка:`, err.message);
      errors++;
    }
  }

  console.log(`\nГотово. Отменено: ${done}, ошибок: ${errors}`);
  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
