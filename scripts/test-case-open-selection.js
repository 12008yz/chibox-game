/**
 * Smoke: единая точка выбора + фильтр бонусного кейса.
 * node scripts/test-case-open-selection.js
 */
const {
  filterItemsForBonusCase,
  selectItemForCaseOpen,
  BONUS_CASE_TEMPLATE_NAME
} = require('../utils/caseOpenItemSelection');
const { determineCaseType } = require('../utils/dropWeightCalculator');

const items = [
  { id: 'a', name: 'cheap', price: 30, rarity: 'consumer' },
  { id: 'b', name: 'expensive', price: 200, rarity: 'covert' }
];

const filtered = filterItemsForBonusCase(items, BONUS_CASE_TEMPLATE_NAME);
if (filtered.length !== 1 || filtered[0].id !== 'a') {
  throw new Error('filterItemsForBonusCase failed');
}

const template = { name: 'Standard', price: 99 };
const caseType = determineCaseType(template, true);
let hits = { a: 0, b: 0 };
for (let i = 0; i < 200; i++) {
  const pick = selectItemForCaseOpen({
    items,
    templateName: 'Test',
    templateId: 'test-id',
    isPaid: true,
    effectiveDropBonus: 0,
    userSubscriptionTier: 0,
    droppedItemIds: [],
    caseType,
    rollUnit: Math.random()
  });
  if (pick?.id === 'a') hits.a++;
  if (pick?.id === 'b') hits.b++;
}
if (hits.a + hits.b !== 200) {
  throw new Error('selectItemForCaseOpen returned null');
}

const bonusOnlyCheap = [];
for (let i = 0; i < 100; i++) {
  const pick = selectItemForCaseOpen({
    items,
    templateName: BONUS_CASE_TEMPLATE_NAME,
    templateId: 'bonus-id',
    isPaid: false,
    effectiveDropBonus: 0,
    userSubscriptionTier: 0,
    droppedItemIds: [],
    caseType: 'bonus',
    rollUnit: Math.random()
  });
  if (pick && parseFloat(pick.price) > 50) {
    throw new Error('bonus case must not drop items > 50');
  }
  bonusOnlyCheap.push(pick?.id);
}
if (bonusOnlyCheap.some((id) => id === 'b')) {
  throw new Error('bonus case selected expensive item');
}

console.log('OK', { filteredBonus: filtered.length, sampleHits: hits });
