const { logger } = require('./logger');

/**
 * Рассчитать модифицированные веса выпадения с учетом бонусов пользователя
 * @param {Array} items - массив предметов с их базовыми весами
 * @param {Object} userBonuses - бонусы пользователя
 * @returns {Array} массив предметов с модифицированными весами
 */
function calculateModifiedDropWeights(items, userBonuses = {}) {
  if (!items || items.length === 0) {
    return [];
  }

  const {
    subscriptionBonus = 0,    // бонус от подписки (до 8%)
    achievementBonus = 0,     // бонус от достижений (до 5%)
    levelBonus = 0           // бонус от уровня (до 2%)
  } = userBonuses;

  // Максимальный бонус 15%
  const totalBonus = Math.min(subscriptionBonus + achievementBonus + levelBonus, 0.15);

  return items.map(item => {
    const baseWeight = parseFloat(item.drop_weight) || 0;
    const itemPrice = parseFloat(item.price) || 0;

    // Бонус применяется больше к дорогим предметам
    let weightMultiplier = 1;
    if (totalBonus > 0) {
      // Для дорогих предметов (>1000₽) бонус работает сильнее
      const priceCategory = Math.min(itemPrice / 1000, 10); // категория от 0 до 10
      const bonusEffect = 1 + (totalBonus * priceCategory / 10);
      weightMultiplier = bonusEffect;
    }

    const modifiedWeight = baseWeight * weightMultiplier;

    return {
      ...item,
      originalWeight: baseWeight,
      modifiedWeight: modifiedWeight,
      bonusApplied: totalBonus,
      weightMultiplier: weightMultiplier
    };
  });
}

/**
 * Выбрать предмет на основе модифицированных весов
 * @param {Array} itemsWithWeights - предметы с модифицированными весами
 * @returns {Object|null} выбранный предмет
 */
function selectItemWithModifiedWeights(itemsWithWeights) {
  if (!itemsWithWeights || itemsWithWeights.length === 0) {
    return null;
  }

  // Рассчитываем общий вес
  const totalWeight = itemsWithWeights.reduce((sum, item) => {
    return sum + (item.modifiedWeight || item.drop_weight || 0);
  }, 0);

  if (totalWeight <= 0) {
    // Если общий вес 0, выбираем случайный предмет
    return itemsWithWeights[Math.floor(Math.random() * itemsWithWeights.length)];
  }

  // Генерируем случайное число
  const random = Math.random() * totalWeight;
  let currentWeight = 0;

  // Находим предмет, соответствующий случайному числу
  for (const item of itemsWithWeights) {
    currentWeight += (item.modifiedWeight || item.drop_weight || 0);
    if (random <= currentWeight) {
      return item;
    }
  }

  // Fallback - возвращаем последний предмет
  return itemsWithWeights[itemsWithWeights.length - 1];
}

/**
 * Выбрать предмет с защитой от дубликатов (для премиум подписки)
 * @param {Array} itemsWithWeights - предметы с модифицированными весами
 * @param {Array} recentItems - недавно выпавшие предметы (ID)
 * @param {number} duplicateProtectionCount - количество последних предметов для проверки
 * @returns {Object|null} выбранный предмет
 */
function selectItemWithModifiedWeightsAndDuplicateProtection(
  itemsWithWeights,
  recentItems = [],
  duplicateProtectionCount = 5
) {
  if (!itemsWithWeights || itemsWithWeights.length === 0) {
    return null;
  }

  // Фильтруем предметы, исключая недавно выпавшие
  const recentItemIds = recentItems.slice(-duplicateProtectionCount);
  const availableItems = itemsWithWeights.filter(item => {
    return !recentItemIds.includes(item.id);
  });

  // Если все предметы в списке недавних, используем все
  const itemsToSelect = availableItems.length > 0 ? availableItems : itemsWithWeights;

  return selectItemWithModifiedWeights(itemsToSelect);
}

/**
 * Получить статистику распределения весов
 * @param {Array} items - предметы с весами
 * @returns {Object} статистика
 */
function getWeightDistributionStats(items) {
  if (!items || items.length === 0) {
    return {
      totalItems: 0,
      totalWeight: 0,
      averageWeight: 0,
      priceCategories: {}
    };
  }

  const totalWeight = items.reduce((sum, item) => {
    return sum + (item.modifiedWeight || item.drop_weight || 0);
  }, 0);

  const averageWeight = totalWeight / items.length;

  // Группировка по ценовым категориям
  const priceCategories = {
    'legendary': { items: [], totalWeight: 0, minPrice: 50000 },
    'mythic': { items: [], totalWeight: 0, minPrice: 30000 },
    'epic': { items: [], totalWeight: 0, minPrice: 20000 },
    'veryRare': { items: [], totalWeight: 0, minPrice: 15000 },
    'rare': { items: [], totalWeight: 0, minPrice: 10000 },
    'uncommonPlus': { items: [], totalWeight: 0, minPrice: 8000 },
    'uncommon': { items: [], totalWeight: 0, minPrice: 5000 },
    'commonPlus': { items: [], totalWeight: 0, minPrice: 3000 },
    'common': { items: [], totalWeight: 0, minPrice: 1000 },
    'frequent': { items: [], totalWeight: 0, minPrice: 500 },
    'veryFrequent': { items: [], totalWeight: 0, minPrice: 100 },
    'cheap': { items: [], totalWeight: 0, minPrice: 0 }
  };

  items.forEach(item => {
    const price = parseFloat(item.price) || 0;
    const weight = item.modifiedWeight || item.drop_weight || 0;

    let category = 'cheap';
    if (price >= 50000) category = 'legendary';
    else if (price >= 30000) category = 'mythic';
    else if (price >= 20000) category = 'epic';
    else if (price >= 15000) category = 'veryRare';
    else if (price >= 10000) category = 'rare';
    else if (price >= 8000) category = 'uncommonPlus';
    else if (price >= 5000) category = 'uncommon';
    else if (price >= 3000) category = 'commonPlus';
    else if (price >= 1000) category = 'common';
    else if (price >= 500) category = 'frequent';
    else if (price >= 100) category = 'veryFrequent';

    priceCategories[category].items.push(item);
    priceCategories[category].totalWeight += weight;
  });

  return {
    totalItems: items.length,
    totalWeight: totalWeight,
    averageWeight: averageWeight,
    priceCategories: priceCategories
  };
}

module.exports = {
  calculateModifiedDropWeights,
  selectItemWithModifiedWeights,
  selectItemWithModifiedWeightsAndDuplicateProtection,
  getWeightDistributionStats
};
