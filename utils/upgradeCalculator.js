/**
 * Утилита для расчета шансов улучшения предметов
 * Обеспечивает единообразные расчеты во всей системе
 */

/**
 * Рассчитывает шанс успеха улучшения на основе соотношения цен
 * @param {number} totalSourcePrice - общая стоимость исходных предметов
 * @param {number} targetPrice - стоимость целевого предмета
 * @returns {object} объект с шансами и деталями расчета
 */
function calculateUpgradeChance(totalSourcePrice, targetPrice) {
   const priceRatio = targetPrice / totalSourcePrice;
 
   // Новая сбалансированная формула для расчета шанса
   // Чем больше соотношение цен, тем меньше шанс
   let baseChance;
   if (priceRatio <= 1.5) {
     // Для небольших улучшений (до 50% дороже) - высокий шанс 30-45%
     baseChance = 45 - ((priceRatio - 1.1) / 0.4) * 15; // от 45% до 30%
   } else if (priceRatio <= 3.0) {
     // Для средних улучшений (от 50% до 200% дороже) - средний шанс 15-30%
     baseChance = 30 - ((priceRatio - 1.5) / 1.5) * 15; // от 30% до 15%
   } else {
     // Для больших улучшений (более 200% дороже) - низкий шанс 3-15%
     baseChance = 15 - ((priceRatio - 3.0) / 5.0) * 12; // от 15% до 3%
   }
 
   // Ограничиваем шанс в разумных пределах
   baseChance = Math.max(3, Math.min(45, baseChance));
 
   // Бонус для недорогих целевых предметов (до 100 рублей)
   if (targetPrice < 100) {
     baseChance += 5; // Увеличиваем шанс на 5% для дешевых целевых предметов
   }
 
   // Убираем бонус за количество предметов - количество не влияет на шанс
   const quantityBonus = 0;
   const finalChance = Math.min(50, baseChance);
 
   return {
     baseChance: Math.round(baseChance * 10) / 10,
     quantityBonus: quantityBonus,
     finalChance: Math.round(finalChance * 10) / 10,
     priceRatio: Math.round(priceRatio * 100) / 100
   };
 }
 
 /**
  * Проверяет, что целевой предмет подходит для улучшения
  * @param {number} totalSourcePrice - общая стоимость исходных предметов
  * @param {number} targetPrice - стоимость целевого предмета
  * @returns {boolean} true если предмет подходит для улучшения
  */
 function isValidUpgradeTarget(totalSourcePrice, targetPrice) {
   // Целевой предмет должен быть минимум на 10% дороже
   return targetPrice > totalSourcePrice * 1.1;
 }
 
 /**
  * Получить диапазон цен для поиска предметов улучшения
  * @param {number} totalSourcePrice - общая стоимость исходных предметов
  * @returns {object} объект с минимальной и максимальной ценой
  */
 function getUpgradePriceRange(totalSourcePrice) {
   const minPrice = totalSourcePrice * 1.1; // Минимум на 10% дороже
   const maxPrice = totalSourcePrice * 8; // Максимум в 8 раз дороже
 
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
 