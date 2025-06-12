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
 * Новая система с учетом рентабельности 20% для сайта, 80% для игроков
 * @param {string} category - Категория редкости
 * @param {number} bonusPercentage - Бонус в процентах (максимум 15%)
 * @returns {number} Множитель для веса
 */
 function calculateBonusMultiplier(category, bonusPercentage) {
    // Уменьшенные базовые множители для поддержания рентабельности
    // При максимальном бонусе 15% изменения весов будут более консервативными
    const baseBonusMultipliers = {
        'legendary': 1.08,      // +8% к весу легендарных при 1% бонуса 
        'mythical': 1.06,       // +6% к весу мифических при 1% бонуса 
        'epic': 1.05,           // +5% к весу эпических при 1% бонуса 
        'very_rare': 1.04,      // +4% к весу очень редких при 1% бонуса
        'rare': 1.03,           // +3% к весу редких при 1% бонуса
        'uncommon_plus': 1.02,  // +2% к весу необычных+ при 1% бонуса
        'uncommon': 1.01,       // +1% к весу необычных при 1% бонуса
        'common_plus': 1.005,   // +0.5% к весу обычных+ при 1% бонуса 
        'common': 1.0,          // Без изменений для обычных
        'frequent': 0.99,       // -1% к весу частых при 1% бонуса 
        'very_frequent': 0.97,  // -3% к весу очень частых при 1% бонуса 
        'cheap': 0.95           // -5% к весу дешевых при 1% бонуса 
    };

    const baseMultiplier = baseBonusMultipliers[category] || 1.0;

    // Рассчитываем итоговый множитель
    // Формула: 1 + (baseMultiplier - 1) * bonusPercentage
    const finalMultiplier = 1 + (baseMultiplier - 1) * bonusPercentage;

    // Ограничиваем множитель более строгими пределами для рентабельности
    return Math.max(0.3, Math.min(finalMultiplier, 2.5));
 }

 /**
 * Рассчитывает модифицированные веса для массива предметов
 * @param {Array} items - Массив предметов
 * @param {number} userDropBonusPercentage - Бонус пользователя в процентах
 * @returns {Array} Массив предметов с модифицированными весами
 */
 function calculateModifiedDropWeights(items, userDropBonusPercentage = 0) {
    console.log(`calculateModifiedDropWeights: входящих предметов ${items.length}, бонус ${userDropBonusPercentage}%`);

    if (!items || items.length === 0) {
        console.error('calculateModifiedDropWeights: массив предметов пустой');
        return [];
    }

    const result = items.map(item => {
        // Правильно копируем Sequelize модель
        const itemData = item.toJSON ? item.toJSON() : item;
        return {
            ...itemData,
            modified_drop_weight: calculateModifiedDropWeight(item, userDropBonusPercentage),
            original_drop_weight: item.drop_weight
        };
    });

    console.log(`calculateModifiedDropWeights: результат ${result.length} предметов`);
    return result;
 }

 /**
 * Выбирает предмет на основе модифицированных весов
 * @param {Array} items - Массив предметов с модифицированными весами
 * @returns {Object} Выбранный предмет
 */
 function selectItemWithModifiedWeights(items) {
    console.log(`selectItemWithModifiedWeights: получено ${items ? items.length : 0} предметов`);

    // Проверяем, что массив не пустой
    if (!items || items.length === 0) {
        console.error('selectItemWithModifiedWeights: массив предметов пустой');
        return null;
    }

    // Рассчитываем общий вес с модифицированными значениями
    const totalWeight = items.reduce((sum, item) => {
        return sum + (item.modified_drop_weight || item.drop_weight || 1);
    }, 0);

    // Проверяем, что общий вес больше 0
    if (totalWeight <= 0) {
        console.error('selectItemWithModifiedWeights: общий вес равен 0');
        return items[0]; // Возвращаем первый предмет
    }

    let randomWeight = Math.random() * totalWeight;

    for (const item of items) {
        const weight = item.modified_drop_weight || item.drop_weight || 1;
        randomWeight -= weight;
        if (randomWeight <= 0) {
            console.log(`selectItemWithModifiedWeights: выбран предмет:`, {
                id: item?.id,
                name: item?.name,
                price: item?.price,
                weight: weight
            });
            return item;
        }
    }

    // Fallback: возвращаем последний предмет если что-то пошло не так
    const fallbackItem = items[items.length - 1];
    console.log(`selectItemWithModifiedWeights: возвращаем fallback предмет:`, {
        id: fallbackItem?.id,
        name: fallbackItem?.name,
        price: fallbackItem?.price
    });
    return fallbackItem;
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

 /**
 * Фильтрует предметы, исключая дубликаты для пользователей с 3 уровнем подписки
 * @param {Array} items - Массив предметов из кейса
 * @param {string} userId - ID пользователя
 * @param {number} subscriptionTier - Уровень подписки пользователя
 * @returns {Array} Отфильтрованный массив предметов
 */
 async function filterDuplicateItems(items, userId, subscriptionTier) {
     // Защита от дубликатов работает только для 3 уровня подписки
     if (subscriptionTier !== 3) {
         return items;
     }

     const db = require('../models');

     try {
         // Получаем все предметы, которые уже есть у пользователя в инвентаре
         const userInventory = await db.UserInventory.findAll({
             where: {
                 user_id: userId,
                 status: ['active', 'equipped'] // исключаем проданные и использованные
             },
             attributes: ['item_id'],
             raw: true
         });

         const ownedItemIds = new Set(userInventory.map(item => item.item_id));

         // Фильтруем предметы, исключая те, что уже есть у пользователя
         const filteredItems = items.filter(item => !ownedItemIds.has(item.id));

         // Если все предметы отфильтрованы (у пользователя уже есть все предметы из кейса),
         // возвращаем самые дешевые предметы, чтобы кейс можно было открыть
         if (filteredItems.length === 0) {
             // Сортируем по цене и берем 3 самых дешевых
             const sortedByPrice = [...items].sort((a, b) => (a.price || 0) - (b.price || 0));
             return sortedByPrice.slice(0, Math.min(3, items.length));
         }

         return filteredItems;
     } catch (error) {
         console.error('Ошибка при фильтрации дубликатов:', error);
         // В случае ошибки возвращаем все предметы
         return items;
     }
 }

 /**
 * Выбирает предмет на основе модифицированных весов с учетом защиты от дубликатов
 * @param {Array} items - Массив предметов с модифицированными весами
 * @param {string} userId - ID пользователя
 * @param {number} subscriptionTier - Уровень подписки пользователя
 * @returns {Object} Выбранный предмет
 */
 async function selectItemWithModifiedWeightsAndDuplicateProtection(items, userId, subscriptionTier) {
     // Применяем фильтр дубликатов если нужно
     const filteredItems = await filterDuplicateItems(items, userId, subscriptionTier);

     // Проверяем, что после фильтрации остались предметы
     if (!filteredItems || filteredItems.length === 0) {
         console.error('selectItemWithModifiedWeightsAndDuplicateProtection: после фильтрации не осталось предметов');
         // Возвращаем случайный предмет из исходного списка
         return selectItemWithModifiedWeights(items);
     }

     // Используем стандартную логику выбора для отфильтрованных предметов
     return selectItemWithModifiedWeights(filteredItems);
 }

 module.exports = {
    calculateModifiedDropWeight,
    calculateModifiedDropWeights,
    selectItemWithModifiedWeights,
    selectItemWithModifiedWeightsAndDuplicateProtection,
    filterDuplicateItems,
    getPriceCategory,
    calculateBonusMultiplier,
    getWeightDistributionStats
 };
