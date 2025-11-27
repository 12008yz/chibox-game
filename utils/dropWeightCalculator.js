const { logger } = require('./logger');

/**
 * Фильтрует исключенные предметы для пользователей Статус++
 * @param {Array} items - массив предметов
 * @param {number} userSubscriptionTier - уровень подписки пользователя
 * @returns {Array} отфильтрованный массив предметов
 */
function filterExcludedItems(items, userSubscriptionTier = 0) {
  if (!items || items.length === 0) {
    return items;
  }

  // Для пользователей Статус++ (tier >= 3) исключаем предметы с is_excluded = true
  if (userSubscriptionTier >= 3) {
    const filteredItems = items.filter(item => !item.is_excluded && !item.isExcluded);
    console.log(`[filterExcludedItems] Отфильтровано для Статус++: ${items.length} -> ${filteredItems.length} предметов`);
    return filteredItems;
  }

  return items;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * НОВАЯ СБАЛАНСИРОВАННАЯ СИСТЕМА ВЕСОВ ДЛЯ ВСЕХ ТИПОВ КЕЙСОВ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ЦЕЛИ:
 * 1. Казино прибыльно при любом объеме открытий
 * 2. Игрокам интересно играть (есть шанс выиграть)
 * 3. Подписчики получают преимущество
 *
 * RTP (Return to Player) - процент возврата игроку ДО продажи предметов
 * После продажи за 65%: реальный возврат = RTP * 0.65
 *
 * ЭКОНОМИКА:
 * - Кейс 499₽: RTP 50% → после продажи 32.5% (казино получает ~67.5% прибыли)
 * - Кейс 99₽: RTP 55% → после продажи 35.75% (казино получает ~64% прибыли)
 * - Подписки: выгодны при открытии 1 кейса/день (RTP 60-70%)
 * - Бесплатный: RTP 45% (мотивация купить подписку)
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * КЕЙС ЗА 499₽ - Премиум кейс (главный источник дохода)
 * Целевой RTP: 50% (средний выигрыш ~250₽)
 * После продажи: игрок получит ~162₽ (32.5%)
 */
function calculateWeightForPremium499(price) {
  price = parseFloat(price) || 0;

  // ДЖЕКПОТЫ (0.5% общий) - очень редкие крупные выигрыши
  if (price >= 20000) return 0.01;      // 0.001% - супер джекпот
  if (price >= 10000) return 0.05;      // 0.005% - мега джекпот
  if (price >= 5000) return 0.15;       // 0.015% - большой джекпот
  if (price >= 3000) return 0.4;        // 0.04% - джекпот
  if (price >= 2000) return 0.8;        // 0.08% - мини джекпот
  if (price >= 1500) return 1.5;        // 0.15% - отличный выигрыш

  // ХОРОШИЕ ВЫИГРЫШИ (2% общий) - удвоение и больше
  if (price >= 1000) return 5;          // 0.5% - x2 выигрыш
  if (price >= 800) return 10;          // 1% - почти x2
  if (price >= 600) return 15;          // 1.5% - хороший выигрыш

  // ОКУП (8% общий) - возврат 80-120% стоимости кейса
  if (price >= 500) return 30;          // 3% - полный окуп
  if (price >= 400) return 50;          // 5% - почти окуп

  // СРЕДНИЙ УБЫТОК (30% общий) - возврат 50-80%
  if (price >= 300) return 100;         // 10% - небольшой убыток
  if (price >= 250) return 120;         // 12% - средний убыток
  if (price >= 200) return 80;          // 8% - заметный убыток

  // БОЛЬШОЙ УБЫТОК (60% общий) - возврат 20-50%
  if (price >= 150) return 200;         // 20% - большой убыток
  if (price >= 120) return 180;         // 18% - очень большой убыток
  if (price >= 100) return 220;         // 22% - огромный убыток

  // МУСОР (очень дешевые предметы)
  if (price >= 50) return 150;          // 15% - дешевка
  return 100;                           // 10% - базовый мусор
}

/**
 * КЕЙС ЗА 99₽ - Стандартный кейс
 * Целевой RTP: 55% (средний выигрыш ~54₽)
 * После продажи: игрок получит ~35₽ (35.4%)
 */
function calculateWeightForStandard99(price) {
  price = parseFloat(price) || 0;

  // ДЖЕКПОТЫ (1% общий) - редкие крупные выигрыши
  if (price >= 3000) return 0.1;        // 0.01% - мега джекпот (x30)
  if (price >= 2000) return 0.2;        // 0.02% - супер джекпот (x20)
  if (price >= 1000) return 0.5;        // 0.05% - большой джекпот (x10)
  if (price >= 800) return 1;           // 0.1% - джекпот (x8)
  if (price >= 500) return 2;           // 0.2% - мини джекпот (x5)
  if (price >= 300) return 5;           // 0.5% - отличный выигрыш (x3)

  // ХОРОШИЕ ВЫИГРЫШИ (4% общий) - удвоение и больше
  if (price >= 200) return 10;          // 1% - x2 выигрыш
  if (price >= 150) return 15;          // 1.5% - хороший выигрыш
  if (price >= 120) return 15;          // 1.5% - неплохой выигрыш

  // ОКУП (10% общий) - возврат 80-120%
  if (price >= 100) return 35;          // 3.5% - полный окуп
  if (price >= 80) return 35;           // 3.5% - почти окуп
  if (price >= 70) return 30;           // 3% - близко к окупу

  // СРЕДНИЙ УБЫТОК (30% общий) - возврат 40-70%
  if (price >= 60) return 100;          // 10% - небольшой убыток
  if (price >= 50) return 120;          // 12% - средний убыток
  if (price >= 40) return 80;           // 8% - заметный убыток

  // БОЛЬШОЙ УБЫТОК (55% общий) - возврат 10-40%
  if (price >= 35) return 200;          // 20% - большой убыток
  if (price >= 30) return 180;          // 18% - очень большой убыток
  if (price >= 25) return 170;          // 17% - огромный убыток

  // МУСОР (очень дешевые)
  return 100;                           // 10% - базовый мусор
}

/**
 * ЕЖЕДНЕВНЫЙ КЕЙС - БЕСПЛАТНЫЙ (без подписки)
 * Целевой RTP: 45% (мотивация купить подписку)
 * Средний выигрыш ~22₽ (предметы до 50₽)
 */
function calculateWeightForFreeDaily(price) {
  price = parseFloat(price) || 0;

  // Редкие выигрыши (3% общий)
  if (price >= 50) return 5;            // 0.5% - максимум для бесплатного
  if (price >= 40) return 10;           // 1% - отличный выигрыш
  if (price >= 30) return 15;           // 1.5% - хороший выигрыш

  // Средние выигрыши (25% общий)
  if (price >= 25) return 80;           // 8% - нормальный выигрыш
  if (price >= 20) return 100;          // 10% - средний выигрыш
  if (price >= 15) return 70;           // 7% - небольшой выигрыш

  // Частые (72% общий) - основная масса
  if (price >= 10) return 250;          // 25% - дешевые предметы
  if (price >= 8) return 270;           // 27% - очень дешевые
  if (price >= 5) return 200;           // 20% - мусор
  return 150;                           // 15% - базовый мусор
}

/**
 * ЕЖЕДНЕВНЫЙ КЕЙС - СТАТУС (1800₽/30 дней = 60₽/день)
 * Целевой RTP: 60% (средний выигрыш ~36₽)
 * Окупаемость подписки при открытии 1 кейса/день
 */
function calculateWeightForStatusTier1(price) {
  price = parseFloat(price) || 0;

  // РЕДКИЕ ДЖЕКПОТЫ (0.5% общий) - приятный сюрприз
  if (price >= 3000) return 0.1;        // 0.01% - мега джекпот
  if (price >= 2000) return 0.3;        // 0.03% - супер джекпот
  if (price >= 1000) return 0.6;        // 0.06% - джекпот
  if (price >= 500) return 1.5;         // 0.15% - большой выигрыш
  if (price >= 300) return 3;           // 0.3% - отличный выигрыш

  // ХОРОШИЕ ВЫИГРЫШИ (5% общий)
  if (price >= 200) return 10;          // 1% - x3+ выигрыш
  if (price >= 150) return 15;          // 1.5% - x2.5 выигрыш
  if (price >= 100) return 15;          // 1.5% - x1.5-2 выигрыш
  if (price >= 80) return 10;           // 1% - хороший выигрыш

  // СРЕДНИЕ ВЫИГРЫШИ (20% общий)
  if (price >= 60) return 50;           // 5% - окуп дня
  if (price >= 50) return 50;           // 5% - близко к окупу
  if (price >= 40) return 60;           // 6% - неплохо
  if (price >= 30) return 40;           // 4% - средний выигрыш

  // ЧАСТЫЕ ДРОПЫ (74.5% общий)
  if (price >= 25) return 120;          // 12% - небольшой убыток
  if (price >= 20) return 150;          // 15% - средний убыток
  if (price >= 15) return 180;          // 18% - заметный убыток
  if (price >= 10) return 200;          // 20% - большой убыток
  if (price >= 8) return 95;            // 9.5% - очень дешевые
  return 80;                            // 8% - мусор
}

/**
 * ЕЖЕДНЕВНЫЙ КЕЙС - СТАТУС+ (3600₽/30 дней = 120₽/день)
 * Целевой RTP: 65% (средний выигрыш ~78₽)
 */
function calculateWeightForStatusTier2(price) {
  price = parseFloat(price) || 0;

  // ДЖЕКПОТЫ (1% общий)
  if (price >= 8000) return 0.05;       // 0.005% - ультра джекпот
  if (price >= 5000) return 0.1;        // 0.01% - мега джекпот
  if (price >= 3000) return 0.3;        // 0.03% - супер джекпот
  if (price >= 2000) return 0.6;        // 0.06% - большой джекпот
  if (price >= 1000) return 1.5;        // 0.15% - джекпот
  if (price >= 800) return 2.5;         // 0.25% - мини джекпот
  if (price >= 500) return 5;           // 0.5% - отличный выигрыш

  // ХОРОШИЕ ВЫИГРЫШИ (8% общий)
  if (price >= 300) return 15;          // 1.5% - x2.5 выигрыш
  if (price >= 200) return 20;          // 2% - x1.6-2 выигрыш
  if (price >= 150) return 25;          // 2.5% - хороший выигрыш
  if (price >= 120) return 20;          // 2% - неплохой выигрыш

  // СРЕДНИЕ ВЫИГРЫШИ (25% общий)
  if (price >= 100) return 60;          // 6% - близко к окупу
  if (price >= 80) return 70;           // 7% - средний выигрыш
  if (price >= 60) return 80;           // 8% - небольшой убыток
  if (price >= 50) return 40;           // 4% - убыток

  // ЧАСТЫЕ ДРОПЫ (66% общий)
  if (price >= 40) return 140;          // 14% - средний убыток
  if (price >= 30) return 160;          // 16% - заметный убыток
  if (price >= 25) return 150;          // 15% - большой убыток
  if (price >= 20) return 130;          // 13% - очень дешевые
  if (price >= 15) return 80;           // 8% - мусор
  return 60;                            // 6% - базовый мусор
}

/**
 * ЕЖЕДНЕВНЫЙ КЕЙС - СТАТУС++ (7500₽/30 дней = 250₽/день)
 * Целевой RTP: 70% (средний выигрыш ~175₽) + защита от дубликатов
 */
function calculateWeightForStatusTier3(price) {
  price = parseFloat(price) || 0;

  // ДЖЕКПОТЫ (2% общий) - чаще, чем в других кейсах
  if (price >= 10000) return 0.1;       // 0.01% - ультра джекпот
  if (price >= 5000) return 0.5;        // 0.05% - мега джекпот
  if (price >= 3000) return 1;          // 0.1% - супер джекпот
  if (price >= 2000) return 2;          // 0.2% - большой джекпот
  if (price >= 1000) return 4;          // 0.4% - джекпот
  if (price >= 800) return 6;           // 0.6% - мини джекпот
  if (price >= 500) return 6;           // 0.6% - отличный выигрыш

  // ХОРОШИЕ ВЫИГРЫШИ (12% общий)
  if (price >= 400) return 20;          // 2% - x1.6 выигрыш
  if (price >= 300) return 30;          // 3% - хороший выигрыш
  if (price >= 250) return 35;          // 3.5% - окуп дня
  if (price >= 200) return 35;          // 3.5% - близко к окупу

  // СРЕДНИЕ ВЫИГРЫШИ (30% общий)
  if (price >= 150) return 80;          // 8% - небольшой убыток
  if (price >= 120) return 90;          // 9% - средний выигрыш
  if (price >= 100) return 70;          // 7% - неплохо
  if (price >= 80) return 60;           // 6% - убыток

  // ЧАСТЫЕ ДРОПЫ (56% общий)
  if (price >= 60) return 120;          // 12% - средний убыток
  if (price >= 50) return 130;          // 13% - заметный убыток
  if (price >= 40) return 110;          // 11% - большой убыток
  if (price >= 30) return 100;          // 10% - очень дешевые
  if (price >= 20) return 100;          // 10% - мусор
  return 80;                            // 8% - базовый мусор
}

/**
 * БОНУСНЫЙ КЕЙС (из мини-игры Safe Cracker)
 * Целевой RTP: 55% (предметы 30-1000₽, средний ~165₽)
 */
function calculateWeightForBonus(price) {
  price = parseFloat(price) || 0;

  // ДЖЕКПОТЫ (2% общий)
  if (price >= 1000) return 5;          // 0.5% - джекпот
  if (price >= 800) return 8;           // 0.8% - мини джекпот
  if (price >= 600) return 7;           // 0.7% - отличный выигрыш

  // ХОРОШИЕ ВЫИГРЫШИ (15% общий)
  if (price >= 500) return 20;          // 2% - очень хороший выигрыш
  if (price >= 400) return 30;          // 3% - хороший выигрыш
  if (price >= 300) return 50;          // 5% - хороший выигрыш
  if (price >= 200) return 50;          // 5% - неплохой выигрыш

  // СРЕДНИЕ ВЫИГРЫШИ (35% общий)
  if (price >= 150) return 100;         // 10% - средний выигрыш
  if (price >= 100) return 120;         // 12% - небольшой выигрыш
  if (price >= 80) return 80;           // 8% - низкий выигрыш
  if (price >= 60) return 50;           // 5% - очень низкий

  // НИЗКИЕ ВЫИГРЫШИ (48% общий)
  if (price >= 50) return 120;          // 12% - дешевые
  if (price >= 40) return 140;          // 14% - очень дешевые
  if (price >= 30) return 220;          // 22% - базовые предметы

  // Предметы дешевле 30₽ не должны попадать в бонусный кейс
  return 0;
}

/**
 * Универсальная функция расчета веса с учетом типа кейса
 * @param {number} price - цена предмета
 * @param {string} caseType - тип кейса
 * @returns {number} правильный вес предмета
 */
function calculateCorrectWeightByPrice(price, caseType = 'premium') {
  price = parseFloat(price) || 0;

  switch(caseType) {
    case 'premium_499':
    case 'premium':
      return calculateWeightForPremium499(price);

    case 'standard_99':
    case 'purchase':
      return calculateWeightForStandard99(price);

    case 'free_daily':
    case 'daily_free':
      return calculateWeightForFreeDaily(price);

    case 'daily_tier1':
    case 'subscription_tier1':
      return calculateWeightForStatusTier1(price);

    case 'daily_tier2':
    case 'subscription_tier2':
      return calculateWeightForStatusTier2(price);

    case 'daily_tier3':
    case 'subscription_tier3':
      return calculateWeightForStatusTier3(price);

    case 'bonus':
    case 'special':
      return calculateWeightForBonus(price);

    default:
      // Fallback на премиум кейс
      console.warn(`Неизвестный тип кейса: ${caseType}, используем премиум веса`);
      return calculateWeightForPremium499(price);
  }
}

/**
 * Выбрать предмет с правильными весами на основе цены (игнорирует drop_weight из БД)
 * @param {Array} items - массив предметов
 * @param {number} userSubscriptionTier - уровень подписки пользователя
 * @param {Array} excludedItemIds - ID исключенных предметов (для Статус++)
 * @param {string} caseType - тип кейса для расчета весов
 * @returns {Object|null} выбранный предмет
 */
function selectItemWithCorrectWeights(items, userSubscriptionTier = 0, excludedItemIds = [], caseType = 'premium') {
  console.log(`[selectItemWithCorrectWeights] Получено предметов: ${items ? items.length : 'null/undefined'}`);
  console.log(`[selectItemWithCorrectWeights] Исключенных предметов: ${excludedItemIds.length}`);
  console.log(`[selectItemWithCorrectWeights] Уровень подписки: ${userSubscriptionTier}`);
  console.log(`[selectItemWithCorrectWeights] Тип кейса: ${caseType}`);

  if (!items || items.length === 0) {
    console.log(`[selectItemWithCorrectWeights] Массив предметов пуст или не существует`);
    return null;
  }

  // Для пользователей Статус++ исключаем уже выпавшие предметы
  let availableItems = items;
  if (userSubscriptionTier >= 3 && excludedItemIds.length > 0) {
    availableItems = items.filter(item => !excludedItemIds.includes(item.id));
    console.log(`[selectItemWithCorrectWeights] Статус++: после исключения осталось ${availableItems.length} предметов`);
  }

  if (availableItems.length === 0) {
    console.log(`[selectItemWithCorrectWeights] Все предметы исключены для пользователя с подпиской ${userSubscriptionTier}`);
    return null;
  }

  // Рассчитываем правильные веса на основе цен с учетом типа кейса
  const itemsWithCorrectWeights = availableItems.map(item => {
    const price = parseFloat(item.price) || 0;
    const correctWeight = calculateCorrectWeightByPrice(price, caseType);

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
    // Если общий вес 0, выбираем случайный предмет из доступных
    console.log(`[selectItemWithCorrectWeights] Общий вес 0, выбираем случайный предмет из доступных`);
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

  // Fallback - возвращаем последний предмет из доступных
  const fallbackItem = itemsWithCorrectWeights[itemsWithCorrectWeights.length - 1];
  console.log(`[selectItemWithCorrectWeights] Fallback - выбран последний предмет: ${fallbackItem ? fallbackItem.id : 'undefined'}`);
  return fallbackItem;
}

/**
 * Рассчитать модифицированные веса выпадения с учетом бонусов пользователя
 * @param {Array} items - массив предметов с их базовыми весами
 * @param {Object|number} userBonuses - бонусы пользователя (объект или общий процент)
 * @param {string} caseType - тип кейса для расчета весов
 * @returns {Array} массив предметов с модифицированными весами
 */
function calculateModifiedDropWeights(items, userBonuses = {}, caseType = 'premium') {
  console.log(`[calculateModifiedDropWeights] Получено ${items ? items.length : 'null/undefined'} предметов`);
  console.log(`[calculateModifiedDropWeights] Бонусы пользователя:`, userBonuses);
  console.log(`[calculateModifiedDropWeights] Тип кейса: ${caseType}`);

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
    totalBonus = Math.min(userBonuses / 100, 0.25); // Максимум 25%
    console.log(`[calculateModifiedDropWeights] Получен числовой бонус: ${userBonuses}% -> ${totalBonus}`);
  } else {
    // Если передан объект с отдельными бонусами
    const {
      subscriptionBonus = 0,    // бонус от подписки (до 5%)
      achievementBonus = 0,     // бонус от достижений (до 17%)
      levelBonus = 0           // бонус от уровня (до 2%)
    } = userBonuses;
    totalBonus = Math.min((subscriptionBonus + achievementBonus + levelBonus) / 100, 0.25); // Максимум 25%
    console.log(`[calculateModifiedDropWeights] Объект бонусов: подписка=${subscriptionBonus}%, достижения=${achievementBonus}%, уровень=${levelBonus}%, итого=${totalBonus}`);
  }

  const result = items.map(item => {
    const itemPrice = parseFloat(item.price) || 0;
    // Используем правильный вес на основе цены и типа кейса вместо drop_weight из БД
    const baseWeight = calculateCorrectWeightByPrice(itemPrice, caseType);

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
 * @param {number} userSubscriptionTier - уровень подписки пользователя
 * @param {Array} excludedItemIds - ID исключенных предметов (для Статус++)
 * @returns {Object|null} выбранный предмет
 */
function selectItemWithModifiedWeights(itemsWithWeights, userSubscriptionTier = 0, excludedItemIds = []) {
  console.log(`[selectItemWithModifiedWeights] Получено предметов: ${itemsWithWeights ? itemsWithWeights.length : 'null/undefined'}`);

  if (!itemsWithWeights || itemsWithWeights.length === 0) {
    console.log(`[selectItemWithModifiedWeights] Массив предметов пуст или не существует`);
    return null;
  }

  // Фильтруем исключенные предметы для пользователей Статус++
  let availableItems = itemsWithWeights;

  if (userSubscriptionTier >= 3 && excludedItemIds.length > 0) {
    availableItems = itemsWithWeights.filter(item => !excludedItemIds.includes(item.id));
    console.log(`[selectItemWithModifiedWeights] Статус++: отфильтровано ${itemsWithWeights.length} -> ${availableItems.length} предметов (исключено ${excludedItemIds.length})`);
  } else {
    // Для обычных пользователей используем старую логику с полями is_excluded/isExcluded
    availableItems = filterExcludedItems(itemsWithWeights, userSubscriptionTier);
  }

  if (availableItems.length === 0) {
    console.log(`[selectItemWithModifiedWeights] Все предметы исключены для пользователя с подпиской ${userSubscriptionTier}`);
    return null;
  }

  // Рассчитываем общий вес
  const totalWeight = availableItems.reduce((sum, item) => {
    const weight = item.modifiedWeight || calculateCorrectWeightByPrice(parseFloat(item.price) || 0);
    return sum + weight;
  }, 0);

  console.log(`[selectItemWithModifiedWeights] Общий вес: ${totalWeight}`);

  if (totalWeight <= 0) {
    // Если общий вес 0, выбираем случайный предмет из доступных
    console.log(`[selectItemWithModifiedWeights] Общий вес 0, выбираем случайный предмет из доступных`);
    const randomItem = availableItems[Math.floor(Math.random() * availableItems.length)];
    console.log(`[selectItemWithModifiedWeights] Выбран случайный предмет: ${randomItem ? randomItem.id : 'undefined'}`);
    return randomItem;
  }

  // Генерируем случайное число
  const random = Math.random() * totalWeight;
  let currentWeight = 0;

  console.log(`[selectItemWithModifiedWeights] Случайное число: ${random}`);

  // Находим предмет, соответствующий случайному числу
  for (const item of availableItems) {
    const itemWeight = item.modifiedWeight || calculateCorrectWeightByPrice(parseFloat(item.price) || 0);
    currentWeight += itemWeight;
    console.log(`[selectItemWithModifiedWeights] Предмет ${item.id}, вес: ${itemWeight}, текущий вес: ${currentWeight}`);

    if (random <= currentWeight) {
      console.log(`[selectItemWithModifiedWeights] Выбран предмет: ${item.id}`);
      return item;
    }
  }

  // Fallback - возвращаем последний предмет из доступных
  const fallbackItem = availableItems[availableItems.length - 1];
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
  duplicateProtectionCount = 5,
  userSubscriptionTier = 0
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

  return selectItemWithModifiedWeights(itemsToSelect, userSubscriptionTier, []);
}

/**
 * Выбрать предмет с полным исключением уже выпавших предметов для пользователей Статус++
 * @param {Array} itemsWithWeights - предметы с модифицированными весами
 * @param {Array} excludedItems - все уже выпавшие предметы (ID)
 * @param {number} userSubscriptionTier - уровень подписки пользователя
 * @returns {Object|null} выбранный предмет
 */
function selectItemWithFullDuplicateProtection(
  itemsWithWeights,
  excludedItems = [],
  userSubscriptionTier = 0
) {
  console.log(`[selectItemWithFullDuplicateProtection] Получено предметов: ${itemsWithWeights ? itemsWithWeights.length : 'null'}`);
  console.log(`[selectItemWithFullDuplicateProtection] Исключено предметов: ${excludedItems.length}`);
  console.log(`[selectItemWithFullDuplicateProtection] Уровень подписки: ${userSubscriptionTier}`);

  if (!itemsWithWeights || itemsWithWeights.length === 0) {
    return null;
  }

  // Для пользователей Статус++ (tier >= 3) полностью исключаем уже выпавшие предметы
  if (userSubscriptionTier >= 3 && excludedItems.length > 0) {
    const availableItems = itemsWithWeights.filter(item => {
      const isExcluded = excludedItems.includes(item.id);
      if (isExcluded) {
        console.log(`[selectItemWithFullDuplicateProtection] Исключаем предмет: ${item.id} (${item.name})`);
      }
      return !isExcluded;
    });

    console.log(`[selectItemWithFullDuplicateProtection] Статус++: после исключения осталось ${availableItems.length} предметов`);

    // Логируем первые несколько доступных предметов
    if (availableItems.length > 0) {
      console.log(`[selectItemWithFullDuplicateProtection] Первые 3 доступных предмета:`,
        availableItems.slice(0, 3).map(item => ({ id: item.id, name: item.name, price: item.price })));
    }

    if (availableItems.length === 0) {
      console.log(`[selectItemWithFullDuplicateProtection] ВНИМАНИЕ: Все предметы исключены для пользователя Статус++!`);
      console.log(`[selectItemWithFullDuplicateProtection] Исходно было предметов: ${itemsWithWeights.length}`);
      console.log(`[selectItemWithFullDuplicateProtection] Исключенных ID: ${excludedItems}`);
      // В этом случае пользователь получил все возможные предметы из кейса
      return null;
    }

    return selectItemWithModifiedWeights(availableItems, userSubscriptionTier, []);
  }

  // Для обычных пользователей используем стандартную логику (без исключений)
  return selectItemWithModifiedWeights(itemsWithWeights, userSubscriptionTier, []);
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

/**
 * Определяет тип кейса на основе шаблона кейса
 * @param {Object} caseTemplate - шаблон кейса
 * @param {boolean} isPaid - является ли кейс платным
 * @returns {string} тип кейса для расчета весов
 */
function determineCaseType(caseTemplate, isPaid = false) {
  if (!caseTemplate) {
    console.warn('[determineCaseType] Шаблон кейса не передан, используем premium по умолчанию');
    return 'premium';
  }

  const templateId = caseTemplate.id;
  const templateName = caseTemplate.name || '';
  const price = caseTemplate.price;

  // Определяем тип по ID шаблона
  // Бесплатный ежедневный кейс
  if (templateId === '11111111-1111-1111-1111-111111111111') {
    return 'free_daily';
  }

  // Ежедневный кейс - Статус (tier 1)
  if (templateId === '22222222-2222-2222-2222-222222222222') {
    return 'daily_tier1';
  }

  // Ежедневный кейс - Статус+ (tier 2)
  if (templateId === '33333333-3333-3333-3333-333333333333') {
    return 'daily_tier2';
  }

  // Ежедневный кейс - Статус++ (tier 3)
  if (templateId === '44444444-4444-4444-4444-444444444444') {
    return 'daily_tier3';
  }

  // Бонусный кейс
  if (templateId === '55555555-5555-5555-5555-555555555555') {
    return 'bonus';
  }

  // Стандартный кейс за 99₽
  if (templateId === '66666666-6666-6666-6666-666666666666' || price === 99) {
    return 'standard_99';
  }

  // Премиум кейс за 499₽
  if (templateId === '77777777-7777-7777-7777-777777777777' || price === 499) {
    return 'premium_499';
  }

  // Новые премиум кейсы
  if (templateId === '88888888-8888-8888-8888-888888888888' || price === 17) {
    return 'standard_99'; // Бронзовый - используем веса стандартного кейса
  }
  if (templateId === '99999999-9999-9999-9999-999999999999' || price === 50) {
    return 'standard_99'; // Серебряный
  }
  if (templateId === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' || price === 100) {
    return 'standard_99'; // Золотой
  }
  if (templateId === 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' || price === 250) {
    return 'premium_499'; // Платиновый - начинаем использовать премиум веса
  }
  if (templateId === 'cccccccc-cccc-cccc-cccc-cccccccccccc' || price === 500) {
    return 'premium_499'; // Алмазный
  }
  if (templateId === 'dddddddd-dddd-dddd-dddd-dddddddddddd' || price === 1000) {
    return 'premium_499'; // Легендарный
  }
  if (templateId === 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' || price === 2500) {
    return 'premium_499'; // Мистический
  }
  if (templateId === 'ffffffff-ffff-ffff-ffff-ffffffffffff' || price === 5000) {
    return 'premium_499'; // Эпический
  }
  if (templateId === '10101010-1010-1010-1010-101010101010' || price === 10000) {
    return 'premium_499'; // Мифический
  }

  // Определяем по типу и цене
  if (caseTemplate.type === 'daily') {
    const minTier = caseTemplate.min_subscription_tier || 0;
    if (minTier === 0) return 'free_daily';
    if (minTier === 1) return 'daily_tier1';
    if (minTier === 2) return 'daily_tier2';
    if (minTier === 3) return 'daily_tier3';
  }

  if (caseTemplate.type === 'special' || templateName.toLowerCase().includes('бонус')) {
    return 'bonus';
  }

  // Платные кейсы
  if (isPaid || price > 0) {
    if (price === 99) return 'standard_99';
    if (price === 499) return 'premium_499';
    // Для других цен используем премиум веса
    return 'premium_499';
  }

  // Fallback
  console.warn(`[determineCaseType] Не удалось определить точный тип кейса для ${templateName} (ID: ${templateId}), используем premium`);
  return 'premium_499';
}

module.exports = {
  calculateModifiedDropWeights,
  selectItemWithModifiedWeights,
  selectItemWithModifiedWeightsAndDuplicateProtection,
  selectItemWithFullDuplicateProtection,
  selectItemWithCorrectWeights,
  filterExcludedItems,
  getWeightDistributionStats,
  calculateCorrectWeightByPrice,
  determineCaseType
};
