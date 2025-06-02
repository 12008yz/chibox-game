/**
 * Утилита для расчета модифицированного drop_weight с учетом бонусов пользователя
 * Система работает следующим образом:
 * 1. Чем выше бонус пользователя, тем больше шанс получить дорогие предметы
 * 2. Бонус влияет на перераспределение весов в пользу дорогих предметов
 * 3. Общая сумма весов остается примерно той же, но распределение меняется
 */

/**
 * Рассчитывает модифицированный drop_weight для предмета с учетом бонусов пользователя
 * @param {Object} item - Предмет с базовым drop_weight и ценой
 * @param {number} userDropBonusPercentage - Общий бонус пользователя в процентах (например, 5.5 для +5.5%)
 * @returns {number} Модифицированный drop_weight
 */
function calculateModifiedDropWeight(item, userDropBonusPercentage = 0) {
   const baseWeight = parseFloat(item.drop_weight) || 1;
   const itemPrice = parseFloat(item.price) || 0;

   // Если бонуса нет, возвращаем базовый вес
   if (userDropBonusPercentage <= 0) {
       return baseWeight;
   }

   // Определяем категорию редкости предмета по цене
   const rarityCategory = getPriceCategory(itemPrice);

   // Рассчитываем множитель бонуса для данной категории
   const bonusMultiplier = calculateBonusMultiplier(rarityCategory, userDropBonusPercentage);

   // Применяем множитель к базовому весу
   const modifiedWeight = baseWeight * bonusMultiplier;

   return Math.max(modifiedWeight, 0.0001); // Минимальный вес для предотвращения 0
}

/**
* Определяет категорию редкости предмета по цене
* @param {number} price - Цена предмета
* @returns {string} Категория редкости
*/
function getPriceCategory(price) {
   if (price >= 50000) return 'legendary';      // Легендарные
   if (price >= 30000) return 'mythical';       // Мифические
   if (price >= 20000) return 'epic';           // Эпические
   if (price >= 15000) return 'very_rare';      // Очень редкие
   if (price >= 10000) return 'rare';           // Редкие
   if (price >= 8000) return 'uncommon_plus';   // Необычные+
   if (price >= 5000) return 'uncommon';        // Необычные
   if (price >= 3000) return 'common_plus';     // Обычные+
   if (price >= 1000) return 'common';          // Обычные
   if (price >= 500) return 'frequent';         // Частые
   if (price >= 100) return 'very_frequent';    // Очень частые
   return 'cheap';                              // Дешевые
}

/**
* Рассчитывает множитель бонуса для категории редкости
* @param {string} category - Категория редкости
* @param {number} bonusPercentage - Бонус в процентах
* @returns {number} Множитель для веса
*/
function calculateBonusMultiplier(category, bonusPercentage) {
   // Базовые множители для каждой категории при 1% бонуса
   const baseBonusMultipliers = {
       'legendary': 1.15,      // +15% к весу легендарных при 1% бонуса
       'mythical': 1.12,       // +12% к весу мифических при 1% бонуса
       'epic': 1.10,           // +10% к весу эпических при 1% бонуса
       'very_rare': 1.08,      // +8% к весу очень редких при 1% бонуса
       'rare': 1.06,           // +6% к весу редких при 1% бонуса
       'uncommon_plus': 1.04,  // +4% к весу необычных+ при 1% бонуса
       'uncommon': 1.02,       // +2% к весу необычных при 1% бонуса
       'common_plus': 1.01,    // +1% к весу обычных+ при 1% бонуса
       'common': 1.0,          // Без изменений для обычных
       'frequent': 0.98,       // -2% к весу частых при 1% бонуса
       'very_frequent': 0.95,  // -5% к весу очень частых при 1% бонуса
       'cheap': 0.90           // -10% к весу дешевых при 1% бонуса
   };

   const baseMultiplier = baseBonusMultipliers[category] || 1.0;

   // Рассчитываем итоговый множитель
   // Формула: 1 + (baseMultiplier - 1) * bonusPercentage
   const finalMultiplier = 1 + (baseMultiplier - 1) * bonusPercentage;

   // Ограничиваем множитель разумными пределами
   return Math.max(0.1, Math.min(finalMultiplier, 5.0));
}

/**
* Рассчитывает модифицированные веса для массива предметов
* @param {Array} items - Массив предметов
* @param {number} userDropBonusPercentage - Бонус пользователя в процентах
* @returns {Array} Массив предметов с модифицированными весами
*/
function calculateModifiedDropWeights(items, userDropBonusPercentage = 0) {
   return items.map(item => ({
       ...item,
       modified_drop_weight: calculateModifiedDropWeight(item, userDropBonusPercentage),
       original_drop_weight: item.drop_weight
   }));
}

/**
* Выбирает предмет на основе модифицированных весов
* @param {Array} items - Массив предметов с модифицированными весами
* @returns {Object} Выбранный предмет
*/
function selectItemWithModifiedWeights(items) {
   // Рассчитываем общий вес с модифицированными значениями
   const totalWeight = items.reduce((sum, item) => {
       return sum + (item.modified_drop_weight || item.drop_weight || 1);
   }, 0);

   let randomWeight = Math.random() * totalWeight;

   for (const item of items) {
       const weight = item.modified_drop_weight || item.drop_weight || 1;
       randomWeight -= weight;
       if (randomWeight <= 0) {
           return item;
       }
   }

   // Fallback: возвращаем последний предмет если что-то пошло не так
   return items[items.length - 1];
}

/**
* Получает статистику распределения весов до и после модификации
* @param {Array} items - Массив предметов
* @param {number} userDropBonusPercentage - Бонус пользователя
* @returns {Object} Статистика распределения
*/
function getWeightDistributionStats(items, userDropBonusPercentage = 0) {
   const modifiedItems = calculateModifiedDropWeights(items, userDropBonusPercentage);

   const originalTotalWeight = items.reduce((sum, item) => sum + (item.drop_weight || 1), 0);
   const modifiedTotalWeight = modifiedItems.reduce((sum, item) => sum + item.modified_drop_weight, 0);

   const stats = {
       userBonus: userDropBonusPercentage,
       originalTotalWeight,
       modifiedTotalWeight,
       weightChange: ((modifiedTotalWeight - originalTotalWeight) / originalTotalWeight * 100).toFixed(2),
       categories: {}
   };

   // Группируем по категориям
   modifiedItems.forEach(item => {
       const category = getPriceCategory(item.price);
       if (!stats.categories[category]) {
           stats.categories[category] = {
               count: 0,
               originalWeight: 0,
               modifiedWeight: 0,
               avgPrice: 0,
               totalPrice: 0
           };
       }

       const cat = stats.categories[category];
       cat.count++;
       cat.originalWeight += (item.drop_weight || 1);
       cat.modifiedWeight += item.modified_drop_weight;
       cat.totalPrice += (item.price || 0);
       cat.avgPrice = cat.totalPrice / cat.count;
   });

   // Рассчитываем проценты для каждой категории
   Object.keys(stats.categories).forEach(category => {
       const cat = stats.categories[category];
       cat.originalPercentage = (cat.originalWeight / originalTotalWeight * 100).toFixed(2);
       cat.modifiedPercentage = (cat.modifiedWeight / modifiedTotalWeight * 100).toFixed(2);
       cat.changePercentage = (cat.modifiedPercentage - cat.originalPercentage).toFixed(2);
   });

   return stats;
}

module.exports = {
   calculateModifiedDropWeight,
   calculateModifiedDropWeights,
   selectItemWithModifiedWeights,
   getPriceCategory,
   calculateBonusMultiplier,
   getWeightDistributionStats
};
