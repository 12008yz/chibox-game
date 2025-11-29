#!/usr/bin/env node

/**
 * Синхронизация весов предметов из dropWeightCalculator.js в базу данных
 *
 * Этот скрипт обновляет все веса предметов в БД на основе функций
 * из dropWeightCalculator.js, чтобы они соответствовали текущей логике весов.
 *
 * Использование:
 *   node scripts/sync-weights.js
 */

require('dotenv').config();
const { recalculateCaseWeights } = require('./update-prices');

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔄 СИНХРОНИЗАЦИЯ ВЕСОВ ИЗ dropWeightCalculator.js');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    await recalculateCaseWeights();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ СИНХРОНИЗАЦИЯ ВЕСОВ ЗАВЕРШЕНА!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\nℹ️  Теперь все веса в БД соответствуют логике из dropWeightCalculator.js');
    console.log('💡 Не забудьте перезапустить сервер: pm2 restart all\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ОШИБКА СИНХРОНИЗАЦИИ:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
