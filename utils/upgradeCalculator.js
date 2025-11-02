/**
 * Утилита для расчета шансов улучшения предметов
 * Обеспечивает единообразные расчеты во всей системе
 * ВАЖНО: Экономика настроена так, что дом ВСЕГДА в выигрыше в долгосрочной перспективе
 * ОБНОВЛЕНО: Понижены шансы на 20-25% для выгоды платформы
 */

/**
 * Рассчитывает шанс успеха улучшения на основе соотношения цен
 * @param {number} totalSourcePrice - общая стоимость исходных предметов
 * @param {number} targetPrice - стоимость целевого предмета
 * @returns {object} объект с шансами и деталями расчета
 */
function calculateUpgradeChance(totalSourcePrice, targetPrice) {
  // Налог платформы 8% от общей стоимости (выгодно для владельца)
  const platformTax = 0.08;
  const effectiveSourcePrice = totalSourcePrice * (1 + platformTax);
  const priceRatio = targetPrice / effectiveSourcePrice;

  // Экономически СТРОГО сбалансированная формула (выгода для платформы)
  // Понижены все шансы на 20-25% для прибыльности
  let baseChance;

  if (totalSourcePrice <= 10) {
    // Для дешевых исходных предметов - ОЧЕНЬ строгая формула
    if (priceRatio <= 1.3) {
      // До x1.3 - средний шанс 35-45%
      baseChance = 45 - ((priceRatio - 1.0) / 0.3) * 10; // от 45% до 35%
    } else if (priceRatio <= 2.5) {
      // x1.3-x2.5 - низкий шанс 15-35%
      baseChance = 35 - ((priceRatio - 1.3) / 1.2) * 20; // от 35% до 15%
    } else if (priceRatio <= 5.0) {
      // x2.5-x5 - очень низкий шанс 5-15%
      baseChance = 15 - ((priceRatio - 2.5) / 2.5) * 10; // от 15% до 5%
    } else if (priceRatio <= 10.0) {
      // x5-x10 - экстремально низкий 2-5%
      baseChance = 5 - ((priceRatio - 5.0) / 5.0) * 3; // от 5% до 2%
    } else {
      // x10+ - минимальный 0.5-2%
      baseChance = 2 - ((priceRatio - 10.0) / 10.0) * 1.5; // от 2% до 0.5%
    }
  } else {
    // Для обычных предметов - строгая формула
    if (priceRatio <= 1.15) {
      // Для небольших улучшений (до 15% дороже) - хороший шанс 45-55%
      baseChance = 55 - ((priceRatio - 1.0) / 0.15) * 10; // от 55% до 45%
    } else if (priceRatio <= 1.5) {
      // x1.15-x1.5 - средний шанс 30-45%
      baseChance = 45 - ((priceRatio - 1.15) / 0.35) * 15; // от 45% до 30%
    } else if (priceRatio <= 3.0) {
      // x1.5-x3 - низкий шанс 10-30%
      baseChance = 30 - ((priceRatio - 1.5) / 1.5) * 20; // от 30% до 10%
    } else if (priceRatio <= 6.0) {
      // x3-x6 - очень низкий 3-10%
      baseChance = 10 - ((priceRatio - 3.0) / 3.0) * 7; // от 10% до 3%
    } else {
      // x6+ - экстремально низкий 0.5-3%
      baseChance = 3 - ((priceRatio - 6.0) / 4.0) * 2.5; // от 3% до 0.5%
    }
  }

  // СТРОГИЕ пределы для выгоды платформы
  baseChance = Math.max(0.5, Math.min(55, baseChance));

  // УБРАНЫ все бонусы для дешевых предметов
  const cheapTargetBonus = 0;

  // Финальный шанс БЕЗ бонусов, максимум 55%
  const finalChance = Math.min(55, baseChance);

  // Вычисляем мат. ожидание С УЧЕТОМ налога платформы
  const expectedValue = (finalChance / 100 * targetPrice) - effectiveSourcePrice;

  return {
    baseChance: Math.round(baseChance * 10) / 10,
    cheapTargetBonus: cheapTargetBonus,
    finalChance: Math.round(finalChance * 10) / 10,
    priceRatio: Math.round(priceRatio * 100) / 100,
    platformTax: platformTax * 100, // В процентах
    effectiveSourcePrice: Math.round(effectiveSourcePrice * 100) / 100,
    isLowValueSource: totalSourcePrice <= 10,
    expectedValue: Math.round(expectedValue * 100) / 100, // Ожидаемая прибыль (обычно отрицательная - выгода для платформы)
    isProfitable: expectedValue > 0 // Выгодно ли игроку (редко будет true)
  };
}

/**
 * Проверяет, что целевой предмет подходит для улучшения
 * @param {number} totalSourcePrice - общая стоимость исходных предметов
 * @param {number} targetPrice - стоимость целевого предмета
 * @returns {boolean} true если предмет подходит для улучшения
 */
function isValidUpgradeTarget(totalSourcePrice, targetPrice) {
  // ОБНОВЛЕНО: Минимальная стоимость исходных предметов 5КР
  if (totalSourcePrice < 5) {
    return false;
  }

  // Для дешевых исходных предметов (5-20КР) - минимум на 10% дороже
  if (totalSourcePrice <= 20) {
    return targetPrice >= totalSourcePrice * 1.10;
  }

  // Для обычных предметов - минимум на 8% дороже
  return targetPrice >= totalSourcePrice * 1.08;
}

/**
 * Получить диапазон цен для поиска предметов улучшения
 * @param {number} totalSourcePrice - общая стоимость исходных предметов
 * @returns {object} объект с минимальной и максимальной ценой
 */
function getUpgradePriceRange(totalSourcePrice) {
  let minPrice, maxPrice;

  if (totalSourcePrice < 5) {
    // ОБНОВЛЕНО: Запрещаем апгрейд дешевых предметов
    return {
      minPrice: 999999,
      maxPrice: 999999
    };
  } else if (totalSourcePrice <= 20) {
    // Для дешевых исходных предметов - минимум на 10% дороже
    minPrice = totalSourcePrice * 1.10;
    maxPrice = totalSourcePrice * 10; // Ограничиваем максимум
  } else {
    minPrice = totalSourcePrice * 1.08; // Минимум на 8% дороже
    maxPrice = totalSourcePrice * 12; // Разумный максимум
  }

  return {
    minPrice,
    maxPrice
  };
}

module.exports = {
  calculateUpgradeChance,
  isValidUpgradeTarget,
  getUpgradePriceRange
};
