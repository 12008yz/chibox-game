/**
 * Утилита для расчета шансов улучшения предметов
 * Обеспечивает единообразные расчеты во всей системе
 * ВАЖНО: Экономика настроена так, что дом всегда в выигрыше в долгосрочной перспективе
 */

/**
 * Рассчитывает шанс успеха улучшения на основе соотношения цен
 * @param {number} totalSourcePrice - общая стоимость исходных предметов
 * @param {number} targetPrice - стоимость целевого предмета
 * @returns {object} объект с шансами и деталями расчета
 */
function calculateUpgradeChance(totalSourcePrice, targetPrice) {
   const priceRatio = targetPrice / totalSourcePrice;
 
   // Экономически сбалансированная формула
   // Чем больше потенциальный выигрыш, тем меньше шанс
   let baseChance;
 
   if (totalSourcePrice <= 5) {
     // Для очень дешевых исходных предметов - более строгая формула
     if (priceRatio <= 1.5) {
       // До x1.5 - хороший шанс 50-65%
       baseChance = 65 - ((priceRatio - 1.0) / 0.5) * 15; // от 65% до 50%
     } else if (priceRatio <= 3.0) {
       // x1.5-x3 - средний шанс 25-50%
       baseChance = 50 - ((priceRatio - 1.5) / 1.5) * 25; // от 50% до 25%
     } else if (priceRatio <= 6.0) {
       // x3-x6 - низкий шанс 10-25%
       baseChance = 25 - ((priceRatio - 3.0) / 3.0) * 15; // от 25% до 10%
     } else if (priceRatio <= 10.0) {
       // x6-x10 - очень низкий шанс 5-10%
       baseChance = 10 - ((priceRatio - 6.0) / 4.0) * 5; // от 10% до 5%
     } else {
       // x10+ - экстремально низкий шанс 1-5%
       baseChance = 5 - ((priceRatio - 10.0) / 5.0) * 4; // от 5% до 1%
     }
   } else {
     // Для обычных предметов - стандартная строгая формула
     if (priceRatio <= 1.2) {
       // Для небольших улучшений (до 20% дороже) - высокий шанс 60-75%
       baseChance = 75 - ((priceRatio - 1.0) / 0.2) * 15; // от 75% до 60%
     } else if (priceRatio <= 2.0) {
       // x1.2-x2 - средний шанс 30-60%
       baseChance = 60 - ((priceRatio - 1.2) / 0.8) * 30; // от 60% до 30%
     } else if (priceRatio <= 4.0) {
       // x2-x4 - низкий шанс 10-30%
       baseChance = 30 - ((priceRatio - 2.0) / 2.0) * 20; // от 30% до 10%
     } else if (priceRatio <= 8.0) {
       // x4-x8 - очень низкий шанс 3-10%
       baseChance = 10 - ((priceRatio - 4.0) / 4.0) * 7; // от 10% до 3%
     } else {
       // x8+ - экстремально низкий шанс 1-3%
       baseChance = 3 - ((priceRatio - 8.0) / 4.0) * 2; // от 3% до 1%
     }
   }
 
   // Ограничиваем шанс в строгих пределах
   baseChance = Math.max(1, Math.min(75, baseChance));
 
   // Минимальный бонус для очень дешевых целевых предметов
   let cheapTargetBonus = 0;
   if (targetPrice < 20) {
     cheapTargetBonus = 3; // +3% для очень дешевых целевых предметов
   } else if (targetPrice < 50) {
     cheapTargetBonus = 1; // +1% для дешевых целевых предметов
   }
 
   // Применяем бонус
   const finalChance = Math.min(80, baseChance + cheapTargetBonus); // Максимум 80%
 
   return {
     baseChance: Math.round(baseChance * 10) / 10,
     cheapTargetBonus: cheapTargetBonus,
     finalChance: Math.round(finalChance * 10) / 10,
     priceRatio: Math.round(priceRatio * 100) / 100,
     isLowValueSource: totalSourcePrice <= 5,
     expectedValue: Math.round((finalChance / 100 * targetPrice - totalSourcePrice) * 100) / 100 // Ожидаемая прибыль
   };
 }
 
 /**
  * Проверяет, что целевой предмет подходит для улучшения
  * @param {number} totalSourcePrice - общая стоимость исходных предметов
  * @param {number} targetPrice - стоимость целевого предмета
  * @returns {boolean} true если предмет подходит для улучшения
  */
 function isValidUpgradeTarget(totalSourcePrice, targetPrice) {
   // Для очень дешевых исходных предметов (до 5КР) - любой более дорогой предмет
   if (totalSourcePrice <= 5) {
     return targetPrice > totalSourcePrice;
   }
 
   // Для остальных - минимум на 5% дороже
   return targetPrice > totalSourcePrice * 1.05;
 }
 
 /**
  * Получить диапазон цен для поиска предметов улучшения
  * @param {number} totalSourcePrice - общая стоимость исходных предметов
  * @returns {object} объект с минимальной и максимальной ценой
  */
 function getUpgradePriceRange(totalSourcePrice) {
   let minPrice, maxPrice;
 
   if (totalSourcePrice <= 5) {
     // Для очень дешевых исходных предметов - любой более дорогой
     minPrice = totalSourcePrice + 0.01;
     maxPrice = totalSourcePrice * 20; // Увеличиваем для больших рисков
   } else {
     minPrice = totalSourcePrice * 1.05; // Минимум на 5% дороже
     maxPrice = totalSourcePrice * 15; // Увеличиваем максимум
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
 