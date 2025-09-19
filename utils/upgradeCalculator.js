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
 
   // Специальная обработка для очень дешевых исходных предметов (до 5КР)
   // Такие предметы обычно используются в больших количествах
   let baseChance;
 
   if (totalSourcePrice <= 5) {
     // Для очень дешевых исходных предметов используем более мягкую формулу
     if (priceRatio <= 2.0) {
       // До x2 - высокий шанс 60-80%
       baseChance = 80 - ((priceRatio - 1.0) / 1.0) * 20; // от 80% до 60%
     } else if (priceRatio <= 4.0) {
       // x2-x4 - хороший шанс 35-60%
       baseChance = 60 - ((priceRatio - 2.0) / 2.0) * 25; // от 60% до 35%
     } else if (priceRatio <= 8.0) {
       // x4-x8 - средний шанс 15-35%
       baseChance = 35 - ((priceRatio - 4.0) / 4.0) * 20; // от 35% до 15%
     } else {
       // x8+ - низкий шанс 5-15%
       baseChance = 15 - ((priceRatio - 8.0) / 4.0) * 10; // от 15% до 5%
     }
   } else {
     // Для обычных предметов используем стандартную формулу
     if (priceRatio <= 1.2) {
       // Для небольших улучшений (до 20% дороже) - очень высокий шанс 75-85%
       baseChance = 85 - ((priceRatio - 1.0) / 0.2) * 10; // от 85% до 75%
     } else if (priceRatio <= 2.0) {
       // Для средних улучшений (от 20% до 100% дороже) - высокий шанс 40-75%
       baseChance = 75 - ((priceRatio - 1.2) / 0.8) * 35; // от 75% до 40%
     } else if (priceRatio <= 4.0) {
       // Для больших улучшений (от 100% до 300% дороже) - средний шанс 15-40%
       baseChance = 40 - ((priceRatio - 2.0) / 2.0) * 25; // от 40% до 15%
     } else if (priceRatio <= 8.0) {
       // Для очень больших улучшений (от 300% до 700% дороже) - низкий шанс 5-15%
       baseChance = 15 - ((priceRatio - 4.0) / 4.0) * 10; // от 15% до 5%
     } else {
       // Для экстремальных улучшений (более 700% дороже) - очень низкий шанс 1-5%
       baseChance = 5 - ((priceRatio - 8.0) / 4.0) * 4; // от 5% до 1%
     }
   }
 
   // Ограничиваем шанс в разумных пределах
   baseChance = Math.max(3, Math.min(85, baseChance));
 
   // Бонус для очень дешевых целевых предметов
   let cheapTargetBonus = 0;
   if (targetPrice < 50) {
     cheapTargetBonus = 8; // +8% для очень дешевых целевых предметов
   } else if (targetPrice < 100) {
     cheapTargetBonus = 4; // +4% для дешевых целевых предметов
   }
 
   // Применяем бонус
   const finalChance = Math.min(90, baseChance + cheapTargetBonus); // Максимум 90%
 
   return {
     baseChance: Math.round(baseChance * 10) / 10,
     cheapTargetBonus: cheapTargetBonus,
     finalChance: Math.round(finalChance * 10) / 10,
     priceRatio: Math.round(priceRatio * 100) / 100,
     isLowValueSource: totalSourcePrice <= 5 // Добавляем индикатор для отладки
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
     maxPrice = totalSourcePrice * 15; // Увеличиваем максимум для дешевых предметов
   } else {
     minPrice = totalSourcePrice * 1.05; // Минимум на 5% дороже
     maxPrice = totalSourcePrice * 12;
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
 