const { logger } = require('./logger');

/**
 * Рассчитать правильный вес предмета на основе его цены
 * @param {number} price - цена предмета
 * @returns {number} правильный вес предмета
 */
function calculateCorrectWeightByPrice(price) {
  price = parseFloat(price) || 0;

  // Система весов на основе цены для создания правильного распределения
  if (price >= 50000) return 0.005;     // 0.5% - легендарные
  if (price >= 30000) return 0.008;     // 0.8% - мифические
  if (price >= 20000) return 0.015;     // 1.5% - эпические
  if (price >= 15000) return 0.025;     // 2.5% - очень редкие
  if (price >= 10000) return 0.04;      // 4% - редкие
  if (price >= 8000) return 0.06;       // 6% - необычные+
  if (price >= 5000) return 0.1;        // 10% - необычные
  if (price >= 3000) return 0.2;        // 20% - обычные+
  if (price >= 1000) return 0.35;       // 35% - обычные
  if (price >= 500) return 0.5;         // 50% - частые
  if (price >= 100) return 0.7;         // 70% - очень частые
  return 1.0;                           // 100% - базовые/дешевые
}

/**
 * Выбрать предмет с правильными весами на основе цены (игнорирует drop_weight из БД)
 * @param {Array} items - массив предметов
 * @returns {Object|null} выбранный предмет
 */
function selectItemWithCorrectWeights(items) {
  console.log(`[selectItemWithCorrectWeights] Получено предметов: ${items ? items.length : 'null/undefined'}`);

  if (!items || items.length === 0) {
    console.log(`[selectItemWithCorrectWeights] Массив предметов пуст или не существует`);
    return null;
  }

  // Рассчитываем правильные веса на основе цен
  const itemsWithCorrectWeights = items.map(item => {
    const price = parseFloat(item.price) || 0;
    const correctWeight = calculateCorrectWeightByPrice(price);

    return {
      ...item,
      correctWeight: correctWeight,
      price: price
    };
  });

  // Рассчитываем общий вес
  const totalWeight = itemsWithCorrectWeights.reduce((sum, item) => {
    return sum + item.correctWeight;
  }, 0);

  console.log(`[selectItemWithCorrectWeights] Общий вес: ${totalWeight}`);
  console.log(`[selectItemWithCorrectWeights] Первые 5 предметов с весами:`,
    itemsWithCorrectWeights.slice(0, 5).map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      correctWeight: item.correctWeight,
      chance: ((item.correctWeight / totalWeight) * 100).toFixed(4) + '%'
    }))
  );

  if (totalWeight <= 0) {
    // Если общий вес 0, выбираем случайный предмет
    console.log(`[selectItemWithCorrectWeights] Общий вес 0, выбираем случайный предмет`);
    const randomItem = itemsWithCorrectWeights[Math.floor(Math.random() * itemsWithCorrectWeights.length)];
    console.log(`[selectItemWithCorrectWeights] Выбран случайный предмет: ${randomItem ? randomItem.id : 'undefined'}`);
    return randomItem;
  }

  // Генерируем случайное число
  const random = Math.random() * totalWeight;
  let currentWeight = 0;

  console.log(`[selectItemWithCorrectWeights] Случайное число: ${random}`);

  // Находим предмет, соответствующий случайному числу
  for (const item of itemsWithCorrectWeights) {
    currentWeight += item.correctWeight;
    console.log(`[selectItemWithCorrectWeights] Предмет ${item.id} (${item.price}₽), вес: ${item.correctWeight}, текущий вес: ${currentWeight}`);

    if (random <= currentWeight) {
      console.log(`[selectItemWithCorrectWeights] Выбран предмет: ${item.id} с ценой ${item.price}₽`);
      return item;
    }
  }

  // Fallback - возвращаем последний предмет
  const fallbackItem = itemsWithCorrectWeights[itemsWithCorrectWeights.length - 1];
  console.log(`[selectItemWithCorrectWeights] Fallback - выбран последний предмет: ${fallbackItem ? fallbackItem.id : 'undefined'}`);
  return fallbackItem;
}

/**
 * Рассчитать модифицированные веса выпадения с учетом бонусов пользователя
 * @param {Array} items - массив предметов с их базовыми весами
 * @param {Object|number} userBonuses - бонусы пользователя (объект или общий процент)
 * @returns {Array} массив предметов с модифицированными весами
 */
function calculateModifiedDropWeights(items, userBonuses = {}) {
  console.log(`[calculateModifiedDropWeights] Получено ${items ? items.length : 'null/undefined'} предметов`);
  console.log(`[calculateModifiedDropWeights] Бонусы пользователя:`, userBonuses);

  if (!items || items.length === 0) {
    return [];
  }

  console.log(`[calculateModifiedDropWeights] Первые 3 предмета до обработки:`, items.slice(0, 3).map(item => ({
    id: item.id,
    name: item.name,
    drop_weight: item.drop_weight,
    price: item.price
  })));

  // Поддерживаем как объект, так и число
  let totalBonus = 0;
  if (typeof userBonuses === 'number') {
    // Если передан процент как число, преобразуем его в долю (например, 15% -> 0.15)
    totalBonus = Math.min(userBonuses / 100, 0.30); // Максимум 30%
    console.log(`[calculateModifiedDropWeights] Получен числовой бонус: ${userBonuses}% -> ${totalBonus}`);
  } else {
    // Если передан объект с отдельными бонусами
    const {
      subscriptionBonus = 0,    // бонус от подписки (до 8%)
      achievementBonus = 0,     // бонус от достижений (до 25%)
      levelBonus = 0           // бонус от уровня (до 2%)
    } = userBonuses;
    totalBonus = Math.min((subscriptionBonus + achievementBonus + levelBonus) / 100, 0.30); // Максимум 30%
    console.log(`[calculateModifiedDropWeights] Объект бонусов: подписка=${subscriptionBonus}%, достижения=${achievementBonus}%, уровень=${levelBonus}%, итого=${totalBonus}`);
  }

  const result = items.map(item => {
    const itemPrice = parseFloat(item.price) || 0;
    // Используем правильный вес на основе цены вместо drop_weight из БД
    const baseWeight = calculateCorrectWeightByPrice(itemPrice);

    // Бонус применяется больше к дорогим предметам
    let weightMultiplier = 1;
    if (totalBonus > 0) {
      // Для дорогих предметов (≥100₽) бонус работает сильнее
      // Предметы от 100₽ до 10000₽ получают масштабируемый бонус
      const priceCategory = Math.min(Math.max(itemPrice - 100, 0) / 100, 50); // категория от 0 до 50
      const bonusEffect = 1 + (totalBonus * (1 + priceCategory / 50));
      weightMultiplier = bonusEffect;

      console.log(`[calculateModifiedDropWeights] Предмет ${item.id} (${itemPrice}₽): категория=${priceCategory.toFixed(2)}, множитель=${weightMultiplier.toFixed(3)}`);
    }

    const modifiedWeight = baseWeight * weightMultiplier;

    const resultItem = {
      // Явно копируем все основные поля
      id: item.id,
      name: item.name,
      description: item.description,
      image_url: item.image_url,
      price: item.price,
      rarity: item.rarity,
      drop_weight: baseWeight, // Используем правильный базовый вес
      min_subscription_tier: item.min_subscription_tier,
      weapon_type: item.weapon_type,
      skin_name: item.skin_name,
      steam_market_hash_name: item.steam_market_hash_name,
      steam_market_url: item.steam_market_url,
      is_available: item.is_available,
      float_value: item.float_value,
      exterior: item.exterior,
      quality: item.quality,
      stickers: item.stickers,
      origin: item.origin,
      in_stock: item.in_stock,
      is_tradable: item.is_tradable,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      category_id: item.category_id,
      // Добавляем расчетные поля
      originalWeight: baseWeight,
      modifiedWeight: modifiedWeight,
      bonusApplied: totalBonus,
      weightMultiplier: weightMultiplier
    };

    return resultItem;
  });

  console.log(`[calculateModifiedDropWeights] Первые 3 предмета после обработки:`, result.slice(0, 3).map(item => ({
    id: item.id,
    name: item.name,
    originalWeight: item.originalWeight,
    modifiedWeight: item.modifiedWeight
  })));

  return result;
}

/**
 * Выбрать предмет на основе модифицированных весов
 * @param {Array} itemsWithWeights - предметы с модифицированными весами
 * @returns {Object|null} выбранный предмет
 */
function selectItemWithModifiedWeights(itemsWithWeights) {
  console.log(`[selectItemWithModifiedWeights] Получено предметов: ${itemsWithWeights ? itemsWithWeights.length : 'null/undefined'}`);

  if (!itemsWithWeights || itemsWithWeights.length === 0) {
    console.log(`[selectItemWithModifiedWeights] Массив предметов пуст или не существует`);
    return null;
  }

  // Рассчитываем общий вес
  const totalWeight = itemsWithWeights.reduce((sum, item) => {
    const weight = item.modifiedWeight || calculateCorrectWeightByPrice(parseFloat(item.price) || 0);
    return sum + weight;
  }, 0);

  console.log(`[selectItemWithModifiedWeights] Общий вес: ${totalWeight}`);

  if (totalWeight <= 0) {
    // Если общий вес 0, выбираем случайный предмет
    console.log(`[selectItemWithModifiedWeights] Общий вес 0, выбираем случайный предмет`);
    const randomItem = itemsWithWeights[Math.floor(Math.random() * itemsWithWeights.length)];
    console.log(`[selectItemWithModifiedWeights] Выбран случайный предмет: ${randomItem ? randomItem.id : 'undefined'}`);
    return randomItem;
  }

  // Генерируем случайное число
  const random = Math.random() * totalWeight;
  let currentWeight = 0;

  console.log(`[selectItemWithModifiedWeights] Случайное число: ${random}`);

  // Находим предмет, соответствующий случайному числу
  for (const item of itemsWithWeights) {
    const itemWeight = item.modifiedWeight || calculateCorrectWeightByPrice(parseFloat(item.price) || 0);
    currentWeight += itemWeight;
    console.log(`[selectItemWithModifiedWeights] Предмет ${item.id}, вес: ${itemWeight}, текущий вес: ${currentWeight}`);

    if (random <= currentWeight) {
      console.log(`[selectItemWithModifiedWeights] Выбран предмет: ${item.id}`);
      return item;
    }
  }

  // Fallback - возвращаем последний предмет
  const fallbackItem = itemsWithWeights[itemsWithWeights.length - 1];
  console.log(`[selectItemWithModifiedWeights] Fallback - выбран последний предмет: ${fallbackItem ? fallbackItem.id : 'undefined'}`);
  return fallbackItem;
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
    return sum + (item.modifiedWeight || calculateCorrectWeightByPrice(parseFloat(item.price) || 0));
  }, 0);

  const averageWeight = totalWeight / items.length;

  // Группировка по ценовым категориям (дорогие предметы начинаются от 100₽)
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
    'expensive': { items: [], totalWeight: 0, minPrice: 100 }, // Дорогие предметы (≥100₽) с бонусом
    'cheap': { items: [], totalWeight: 0, minPrice: 0 }        // Дешевые предметы (<100₽) без бонуса
  };

  items.forEach(item => {
    const price = parseFloat(item.price) || 0;
    const weight = item.modifiedWeight || calculateCorrectWeightByPrice(price);

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
    else if (price >= 100) category = 'expensive'; // Дорогие предметы с бонусом

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
  getWeightDistributionStats,
  calculateCorrectWeightByPrice,
  selectItemWithCorrectWeights
};
