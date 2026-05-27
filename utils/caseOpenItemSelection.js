/**
 * Единая точка выбора предмета при открытии кейса.
 * Используется: openCase, openCaseFromInventory, provably fair verify, fakeActivity (боты).
 *
 * Веса и кривые — только dropWeightCalculator.js.
 * Бонусы пользователя — userBonusCalculator.js (+ softPity в openCase до вызова).
 * Случайность — rollUnit (provably fair) или Math.random в pickItemByWeights.
 */

const {
  calculateModifiedDropWeights,
  selectItemWithCorrectWeights,
  selectItemWithModifiedWeights,
  selectItemWithModifiedWeightsAndDuplicateProtection,
  selectItemWithFullDuplicateProtection
} = require('./dropWeightCalculator');

const STATUS_PLUS_DAILY_TEMPLATE_ID = '44444444-4444-4444-4444-444444444444';
const BONUS_CASE_TEMPLATE_NAME = 'Бонусный кейс';
const SUBSCRIPTION_DUPLICATE_PROTECTION_COUNT = 5;

/**
 * Ограничение пула для «Бонусного кейса» (только при открытии / verify).
 */
function filterItemsForBonusCase(items, templateName) {
  if (templateName !== BONUS_CASE_TEMPLATE_NAME || !items?.length) {
    return items || [];
  }
  const filtered = items.filter((item) => (parseFloat(item.price) || 0) <= 50);
  return filtered.length > 0 ? filtered : items;
}

/**
 * Выбор одного предмета по правилам openCase (прямое и из инвентаря — одна логика).
 *
 * @param {Object} params
 * @param {Array} params.items — пул предметов шаблона
 * @param {string} [params.templateName] — для фильтра «Бонусного кейса» (≤50₽)
 * @param {string} params.templateId
 * @param {boolean} params.isPaid
 * @param {number} params.effectiveDropBonus — итоговый % (user + soft-pity)
 * @param {number} params.userSubscriptionTier
 * @param {string[]} params.droppedItemIds — уже выпавшие из этого шаблона
 * @param {string} params.caseType — из determineCaseType
 * @param {number|null} [params.rollUnit] — provably fair, иначе Math.random
 */
function selectItemForCaseOpen({
  items,
  templateName = '',
  templateId,
  isPaid,
  effectiveDropBonus,
  userSubscriptionTier = 0,
  droppedItemIds = [],
  caseType,
  rollUnit = null
}) {
  const pool = filterItemsForBonusCase(items, templateName);
  if (!pool?.length) {
    return null;
  }

  const bonus = parseFloat(effectiveDropBonus) || 0;
  const tier = userSubscriptionTier || 0;
  const dropped = Array.isArray(droppedItemIds) ? droppedItemIds : [];
  const isStatusPlusDaily =
    tier >= 3 && templateId === STATUS_PLUS_DAILY_TEMPLATE_ID;

  if (bonus > 0) {
    const modifiedItems = calculateModifiedDropWeights(pool, bonus, caseType);

    if (isStatusPlusDaily) {
      return selectItemWithFullDuplicateProtection(
        modifiedItems,
        dropped,
        tier,
        caseType,
        rollUnit
      );
    }
    if (tier >= 3) {
      return selectItemWithModifiedWeights(modifiedItems, tier, [], caseType, rollUnit);
    }
    if (!isPaid) {
      return selectItemWithModifiedWeightsAndDuplicateProtection(
        modifiedItems,
        dropped,
        SUBSCRIPTION_DUPLICATE_PROTECTION_COUNT,
        tier,
        caseType,
        rollUnit
      );
    }
    return selectItemWithModifiedWeights(modifiedItems, tier, dropped, caseType, rollUnit);
  }

  if (isStatusPlusDaily) {
    return selectItemWithFullDuplicateProtection(pool, dropped, tier, caseType, rollUnit);
  }
  if (tier >= 3) {
    return selectItemWithCorrectWeights(pool, tier, [], caseType, rollUnit);
  }
  return selectItemWithCorrectWeights(pool, tier, dropped, caseType, rollUnit);
}

module.exports = {
  STATUS_PLUS_DAILY_TEMPLATE_ID,
  BONUS_CASE_TEMPLATE_NAME,
  filterItemsForBonusCase,
  selectItemForCaseOpen
};
