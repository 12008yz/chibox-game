/**
 * Smoke-тест логики soft-pity без Redis (in-memory).
 * Запуск: node scripts/test-soft-pity.js
 */
process.env.DROP_SOFT_PITY_ENABLED = 'true';
process.env.DROP_SOFT_PITY_PAID_ONLY = 'true';
process.env.DROP_SOFT_PITY_THRESHOLD = '3';
process.env.DROP_SOFT_PITY_DURATION_OPENS = '2';
process.env.DROP_SOFT_PITY_BOOST_PERCENT = '3';
process.env.USE_REDIS = 'false';

const softPity = require('../services/softPityService');

const userId = 'test-user-pity';
const casePrice = 100;
const isPaid = true;

async function open(itemPrice, label) {
  const prep = await softPity.prepareForOpen(userId, { isPaid, casePrice });
  const effective = softPity.capEffectiveBonus(0, prep.pityBonusPercent, isPaid);
  const state = await softPity.completeOpen(userId, {
    isPaid,
    casePrice,
    itemPrice,
    pityWasActive: prep.pityBonusPercent > 0
  });
  console.log(
    label,
    '| item=',
    itemPrice,
    '| pity%=',
    prep.pityBonusPercent,
    '| effective%=',
    effective,
    '| streak=',
    state.dryStreak,
    '| boostsLeft=',
    state.boostedOpensRemaining
  );
  return prep.pityBonusPercent;
}

async function run() {
  let pityHits = 0;
  pityHits += await open(10, 'open1');
  pityHits += await open(20, 'open2');
  pityHits += await open(30, 'open3');
  const pity4 = await open(40, 'open4-trigger');
  const pity5 = await open(50, 'open5-pity1');
  const pity6 = await open(90, 'open6-pity2-reset');

  if (pity4 <= 0) throw new Error('Expected pity on open4 after 3 bad opens');
  if (pity5 <= 0) throw new Error('Expected pity on open5');
  if (pity6 > 0) throw new Error('Expected no pity on open6 after qualifying win');
  console.log('OK');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
