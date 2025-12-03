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
 * СБАЛАНСИРОВАННАЯ СИСТЕМА ВЕСОВ ДЛЯ ВСЕХ ТИПОВ КЕЙСОВ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ЦЕЛИ:
 * 1. Казино ВСЕГДА прибыльно (проигрыши в 60-70% случаев)
 * 2. Игрокам интересно играть (есть шанс на джекпот, но он редкий)
 * 3. Подписчики получают преимущество (выше RTP)
 *
 * RTP (Return to Player) - процент возврата игроку ДО продажи предметов
 * После продажи за 65%: реальный возврат = RTP * 0.65
 *
 * ЭКОНОМИКА:
 * - Бесплатный кейс: RTP 40% → после продажи ~26% (мотивация купить подписку)
 * - Кейс 99₽: RTP 70% → после продажи ~45.5% (казино получает ~30% прибыли)
 * - Кейс 250₽: RTP 75% → после продажи ~49% (казино получает ~26% прибыли)
 * - Дорогие кейсы: RTP 75-80% → после продажи ~49-52% (казино получает ~25-20% прибыли)
 * - Подписки: RTP немного выше за счет защиты от дубликатов
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * НОВАЯ СИСТЕМА: ПРОИГРЫШИ ЧАЩЕ, НО ДЖЕКПОТЫ ВОЗМОЖНЫ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * СТРАТЕГИЯ АЗАРТА (для платных кейсов):
 * - 48% шанс: БОЛЬШОЙ ПРОИГРЫШ (20-70% от цены) - частые проигрыши!
 * - 15% шанс: ПОЧТИ ОКУП (70-95% от цены) - "близко, но не хватило"
 * - 8% шанс: ОКУП (95-110% от цены) - редкий окуп создаёт азарт
 * - 12% шанс: НЕБОЛЬШОЙ ВЫИГРЫШ (110-160% от цены) - приятный бонус
 * - 8% шанс: ХОРОШИЙ ВЫИГРЫШ (160-250% от цены) - неплохой профит
 * - 3% шанс: СРЕДНИЙ ДЖЕКПОТ (250-500% от цены) - редко, но бывает
 * - 0.8% шанс: БОЛЬШОЙ ДЖЕКПОТ (500-1000% от цены) - очень редко
 * - 0.2% шанс: МЕГА ДЖЕКПОТ (1000-2000% от цены) - крайне редко
 * - 0.05% шанс: УЛЬТРА ДЖЕКПОТ (2000%+ от цены) - почти невозможно
 *
 * ВАЖНО: Дорогие предметы (>5x от цены кейса) выпадают ОЧЕНЬ редко!
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * УНИВЕРСАЛЬНАЯ ФУНКЦИЯ для всех платных кейсов
 * Работает пропорционально цене кейса
 * ЦЕЛЬ: RTP ~75% для азартной игры (казино в плюсе, но игрокам интересно)
 */
function calculateWeightForPaidCase(price, casePrice) {
  price = parseFloat(price) || 0;
  const ratio = price / casePrice; // Во сколько раз предмет дороже кейса

  // УЛЬТРА ДЖЕКПОТЫ (0.05% общий) - x20+ от цены кейса - ОЧЕНЬ РЕДКО!
  if (ratio >= 50) return 0.005;        // 0.0005% - x50+ (почти невозможно)
  if (ratio >= 30) return 0.01;         // 0.001% - x30-50
  if (ratio >= 20) return 0.03;         // 0.003% - x20-30

  // МЕГА ДЖЕКПОТЫ (0.2% общий) - x10-20 от цены - КРАЙНЕ РЕДКО
  if (ratio >= 15) return 0.05;         // 0.005% - x15-20
  if (ratio >= 10) return 0.1;          // 0.01% - x10-15
  if (ratio >= 8) return 0.2;           // 0.02% - x8-10

  // БОЛЬШИЕ ДЖЕКПОТЫ (0.8% общий) - x5-8 от цены - ОЧЕНЬ РЕДКО
  if (ratio >= 7) return 0.3;           // 0.03% - x7-8
  if (ratio >= 6) return 0.5;           // 0.05% - x6-7
  if (ratio >= 5) return 1.0;           // 0.1% - x5-6

  // СРЕДНИЕ ДЖЕКПОТЫ (3% общий) - x3-5 от цены - РЕДКО
  if (ratio >= 4) return 2.5;           // 0.25% - x4-5
  if (ratio >= 3.5) return 4;           // 0.4% - x3.5-4
  if (ratio >= 3) return 6;             // 0.6% - x3-3.5
  if (ratio >= 2.5) return 8;           // 0.8% - x2.5-3

  // ХОРОШИЕ ВЫИГРЫШИ (8% общий) - x2-2.5 от цены - НЕЧАСТО
  if (ratio >= 2.2) return 12;          // 1.2% - x2.2-2.5
  if (ratio >= 2) return 18;            // 1.8% - x2-2.2
  if (ratio >= 1.8) return 25;          // 2.5% - x1.8-2
  if (ratio >= 1.6) return 25;          // 2.5% - x1.6-1.8

  // НЕБОЛЬШИЕ ВЫИГРЫШИ (12% общий) - x1.2-1.6 от цены
  if (ratio >= 1.4) return 35;          // 3.5% - x1.4-1.6
  if (ratio >= 1.2) return 45;          // 4.5% - x1.2-1.4
  if (ratio >= 1.1) return 40;          // 4% - x1.1-1.2

  // ОКУП (8% общий) - x1-1.1 от цены (редкий окуп = азарт)
  if (ratio >= 1.0) return 40;          // 4% - точный окуп
  if (ratio >= 0.95) return 40;         // 4% - почти окуп

  // ПОЧТИ ОКУП (15% общий) - x0.7-0.95 - ЧАСТЫЕ ПРОИГРЫШИ
  if (ratio >= 0.85) return 60;         // 6% - небольшой проигрыш
  if (ratio >= 0.75) return 70;         // 7% - средний проигрыш
  if (ratio >= 0.7) return 20;          // 2% - заметный проигрыш

  // СРЕДНИЙ УБЫТОК (28% общий) - x0.4-0.7 - ЧАСТЫЕ ПРОИГРЫШИ!
  if (ratio >= 0.6) return 90;          // 9% - большой проигрыш
  if (ratio >= 0.5) return 100;         // 10% - очень большой проигрыш
  if (ratio >= 0.4) return 90;          // 9% - огромный проигрыш

  // БОЛЬШОЙ УБЫТОК (20% общий) - x0.2-0.4 - ОЧЕНЬ ЧАСТЫЕ ПРОИГРЫШИ!
  if (ratio >= 0.3) return 100;         // 10% - катастрофический проигрыш
  if (ratio >= 0.2) return 100;         // 10% - полный проигрыш

  // МУСОР (5% общий) - меньше 20% от цены - мусорные предметы
  if (ratio >= 0.1) return 50;          // 5% - абсолютный мусор
  return 30;                            // 3% - дно
}

/**
 * БРОНЗОВЫЙ КЕЙС - 17₽
 * RTP: 70% (средний выигрыш ~12₽)
 * Проигрыши в 60% случаев
 */
function calculateWeightForBronze17(price) {
  return calculateWeightForPaidCase(price, 17);
}

/**
 * ПУШИСТЫЙ КЕЙС - 49₽
 * RTP: 70% (средний выигрыш ~34₽)
 * Проигрыши в 60% случаев
 */
function calculateWeightForFluffy49(price) {
  return calculateWeightForPaidCase(price, 49);
}

/**
 * ЗОЛОТОЙ КЕЙС - 101₽
 * RTP: 70% (средний выигрыш ~71₽)
 * Проигрыши в 60% случаев
 */
function calculateWeightForGold101(price) {
  return calculateWeightForPaidCase(price, 101);
}

/**
 * ПЛАТИНОВЫЙ КЕЙС - 250₽
 * RTP: 80% (средний выигрыш ~200₽)
 */
function calculateWeightForPlatinum250(price) {
  return calculateWeightForPaidCase(price, 250);
}

/**
 * ПРЕМИУМ КЕЙС - 499₽
 * RTP: 75% (средний выигрыш ~374₽)
 * Проигрыши в 55% случаев
 */
function calculateWeightForPremium499(price) {
  return calculateWeightForPaidCase(price, 499);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * РАВНОМЕРНОЕ РАСПРЕДЕЛЕНИЕ ДЛЯ ПРЕМИУМ КЕЙСОВ (от 601₽)
 * ═══════════════════════════════════════════════════════════════════════════
 * Для кейсов от 601₽ и выше все предметы имеют ОДИНАКОВЫЕ шансы выпадения
 * Вес = 100 для всех предметов (равномерное распределение)
 * ═══════════════════════════════════════════════════════════════════════════
 */
function calculateWeightForEqualDistribution(price) {
  // Все предметы имеют одинаковый вес независимо от цены
  return 100;
}

/**
 * АЛМАЗНЫЙ КЕЙС - 601₽
 * РАВНОМЕРНОЕ РАСПРЕДЕЛЕНИЕ - все предметы имеют одинаковые шансы
 */
function calculateWeightForDiamond601(price) {
  return calculateWeightForEqualDistribution(price);
}

/**
 * ЛЕГЕНДАРНЫЙ КЕЙС - 998₽
 * РАВНОМЕРНОЕ РАСПРЕДЕЛЕНИЕ - все предметы имеют одинаковые шансы
 */
function calculateWeightForLegendary998(price) {
  return calculateWeightForEqualDistribution(price);
}

/**
 * МИСТИЧЕСКИЙ КЕЙС - 2499₽
 * РАВНОМЕРНОЕ РАСПРЕДЕЛЕНИЕ - все предметы имеют одинаковые шансы
 */
function calculateWeightForMystic2499(price) {
  return calculateWeightForEqualDistribution(price);
}

/**
 * ЭПИЧЕСКИЙ КЕЙС - 5000₽
 * РАВНОМЕРНОЕ РАСПРЕДЕЛЕНИЕ - все предметы имеют одинаковые шансы
 */
function calculateWeightForEpic5000(price) {
  return calculateWeightForEqualDistribution(price);
}

/**
 * МИФИЧЕСКИЙ КЕЙС - 10000₽
 * РАВНОМЕРНОЕ РАСПРЕДЕЛЕНИЕ - все предметы имеют одинаковые шансы
 */
function calculateWeightForMythic10000(price) {
  return calculateWeightForEqualDistribution(price);
}

/**
 * КЕЙС ЗА 99₽ - Стандартный кейс
 * Целевой RTP: 70% (средний выигрыш ~70₽)
 * Проигрыши в 60-70% случаев, но есть шанс на джекпот
 */
function calculateWeightForStandard99(price) {
  price = parseFloat(price) || 0;

  // УЛЬТРА ДЖЕКПОТЫ (0.03% общий) - x50+ от 99₽ = 5000₽+
  if (price >= 10000) return 0.003;     // 0.0003% - x100+ (фантастика!)
  if (price >= 8000) return 0.005;      // 0.0005% - x80+
  if (price >= 6000) return 0.01;       // 0.001% - x60+
  if (price >= 5000) return 0.015;      // 0.0015% - x50+ (крайне редко)

  // МЕГА ДЖЕКПОТЫ (0.15% общий) - x10-50 от 99₽ = 1000-5000₽
  if (price >= 4000) return 0.02;       // 0.002% - x40
  if (price >= 3000) return 0.03;       // 0.003% - x30
  if (price >= 2000) return 0.05;       // 0.005% - x20
  if (price >= 1500) return 0.08;       // 0.008% - x15
  if (price >= 1000) return 0.15;       // 0.015% - x10 (очень редко)

  // БОЛЬШИЕ ДЖЕКПОТЫ (0.6% общий) - x5-10 от 99₽ = 500-1000₽
  if (price >= 900) return 0.2;         // 0.02% - x9
  if (price >= 800) return 0.3;         // 0.03% - x8
  if (price >= 700) return 0.4;         // 0.04% - x7
  if (price >= 600) return 0.5;         // 0.05% - x6
  if (price >= 500) return 0.8;         // 0.08% - x5 (редко)

  // СРЕДНИЕ ДЖЕКПОТЫ (3% общий) - x3-5 от 99₽ = 300-500₽
  if (price >= 450) return 1.5;         // 0.15% - x4.5
  if (price >= 400) return 2;           // 0.2% - x4
  if (price >= 350) return 3;           // 0.3% - x3.5
  if (price >= 300) return 6;           // 0.6% - x3

  // ХОРОШИЕ ВЫИГРЫШИ (8% общий) - x2-3 от 99₽ = 200-300₽
  if (price >= 250) return 12;          // 1.2% - x2.5
  if (price >= 200) return 20;          // 2% - x2
  if (price >= 180) return 22;          // 2.2% - x1.8
  if (price >= 150) return 26;          // 2.6% - x1.5

  // НЕБОЛЬШИЕ ВЫИГРЫШИ (10% общий) - x1.2-1.5 от 99₽ = 120-150₽
  if (price >= 140) return 30;          // 3% - x1.4
  if (price >= 120) return 35;          // 3.5% - x1.2
  if (price >= 110) return 35;          // 3.5% - x1.1

  // ОКУП (7% общий) - x0.95-1.1 от 99₽ = 95-110₽
  if (price >= 100) return 35;          // 3.5% - точный окуп
  if (price >= 95) return 35;           // 3.5% - почти окуп

  // ПОЧТИ ОКУП (12% общий) - x0.7-0.95 от 99₽ = 70-95₽
  if (price >= 85) return 45;           // 4.5% - небольшой проигрыш
  if (price >= 75) return 50;           // 5% - средний проигрыш
  if (price >= 70) return 25;           // 2.5% - заметный проигрыш

  // СРЕДНИЙ УБЫТОК (30% общий) - x0.4-0.7 от 99₽ = 40-70₽
  if (price >= 60) return 90;           // 9% - большой проигрыш
  if (price >= 50) return 110;          // 11% - очень большой проигрыш
  if (price >= 40) return 100;          // 10% - огромный проигрыш

  // БОЛЬШОЙ УБЫТОК (25% общий) - x0.2-0.4 от 99₽ = 20-40₽
  if (price >= 35) return 100;          // 10% - катастрофа
  if (price >= 30) return 90;           // 9% - полный проигрыш
  if (price >= 25) return 60;           // 6% - мусор

  // МУСОР (4% общий) - меньше 25₽
  if (price >= 20) return 40;           // 4% - абсолютный мусор
  return 20;                            // 2% - дно
}

/**
 * ЕЖЕДНЕВНЫЙ КЕЙС - БЕСПЛАТНЫЙ (без подписки)
 * Целевой RTP: 40% (мотивация купить подписку)
 * Средний выигрыш ~20₽ (предметы до 50₽)
 * Проигрыши в 85% случаев
 */
function calculateWeightForFreeDaily(price) {
  price = parseFloat(price) || 0;

  // Редкие выигрыши (2% общий) - максимум 50₽
  if (price >= 50) return 2;            // 0.2% - максимум для бесплатного
  if (price >= 45) return 3;            // 0.3% - отличный выигрыш
  if (price >= 40) return 5;            // 0.5% - хороший выигрыш
  if (price >= 35) return 10;           // 1% - неплохой выигрыш

  // Средние выигрыши (13% общий)
  if (price >= 30) return 30;           // 3% - нормальный выигрыш
  if (price >= 25) return 40;           // 4% - средний выигрыш
  if (price >= 20) return 60;           // 6% - небольшой выигрыш

  // Частые дропы (85% общий) - основная масса мусора
  if (price >= 15) return 150;          // 15% - дешевые предметы
  if (price >= 10) return 250;          // 25% - очень дешевые
  if (price >= 8) return 200;           // 20% - мусор
  if (price >= 5) return 150;           // 15% - базовый мусор
  return 100;                           // 10% - абсолютное дно
}

/**
 * ЕЖЕДНЕВНЫЙ КЕЙС - СТАТУС (1800₽/30 дней = 60₽/день)
 * Целевой RTP: 60% (средний выигрыш ~36₽)
 * Окупаемость подписки при открытии 1 кейса/день
 */
function calculateWeightForStatusTier1(price) {
  price = parseFloat(price) || 0;

  // СУПЕР РЕДКИЕ ДЖЕКПОТЫ (0.2% общий) - приятный сюрприз для подписчиков
  if (price >= 10000) return 0.01;      // 0.001% - ультра джекпот (x166)
  if (price >= 8000) return 0.02;       // 0.002% - мега джекпот++ (x133)
  if (price >= 6000) return 0.03;       // 0.003% - мега джекпот+ (x100)
  if (price >= 5000) return 0.05;       // 0.005% - мега джекпот (x83)
  if (price >= 4000) return 0.1;        // 0.01% - огромный джекпот (x66)
  if (price >= 3000) return 0.2;        // 0.02% - большой джекпот (x50)
  if (price >= 2000) return 0.4;        // 0.04% - крупный джекпот (x33)
  if (price >= 1000) return 1;          // 0.1% - джекпот (x16)
  if (price >= 500) return 2;           // 0.2% - мини джекпот (x8)
  if (price >= 300) return 4;           // 0.4% - отличный выигрыш (x5)

  // ХОРОШИЕ ВЫИГРЫШИ (5% общий)
  if (price >= 200) return 12;          // 1.2% - x3+ выигрыш
  if (price >= 150) return 15;          // 1.5% - x2.5 выигрыш
  if (price >= 100) return 18;          // 1.8% - x1.5-2 выигрыш
  if (price >= 80) return 15;           // 1.5% - хороший выигрыш

  // СРЕДНИЕ ВЫИГРЫШИ (20% общий)
  if (price >= 60) return 50;           // 5% - окуп дня
  if (price >= 50) return 50;           // 5% - близко к окупу
  if (price >= 40) return 60;           // 6% - неплохо
  if (price >= 30) return 40;           // 4% - средний выигрыш

  // ЧАСТЫЕ ДРОПЫ (74.8% общий)
  if (price >= 25) return 120;          // 12% - небольшой убыток
  if (price >= 20) return 150;          // 15% - средний убыток
  if (price >= 15) return 180;          // 18% - заметный убыток
  if (price >= 10) return 200;          // 20% - большой убыток
  if (price >= 8) return 98;            // 9.8% - очень дешевые
  return 80;                            // 8% - мусор
}

/**
 * ЕЖЕДНЕВНЫЙ КЕЙС - СТАТУС+ (3600₽/30 дней = 120₽/день)
 * Целевой RTP: 65% (средний выигрыш ~78₽)
 */
function calculateWeightForStatusTier2(price) {
  price = parseFloat(price) || 0;

  // СУПЕР ДЖЕКПОТЫ (0.5% общий) - больше шансов на дорогие предметы
  if (price >= 20000) return 0.01;      // 0.001% - ультра мега джекпот (x166)
  if (price >= 15000) return 0.02;      // 0.002% - супер мега джекпот (x125)
  if (price >= 10000) return 0.05;      // 0.005% - мега джекпот++ (x83)
  if (price >= 8000) return 0.08;       // 0.008% - мега джекпот+ (x66)
  if (price >= 5000) return 0.15;       // 0.015% - мега джекпот (x41)
  if (price >= 3000) return 0.4;        // 0.04% - большой джекпот (x25)
  if (price >= 2000) return 0.8;        // 0.08% - крупный джекпот (x16)
  if (price >= 1000) return 2;          // 0.2% - джекпот (x8)
  if (price >= 800) return 3.5;         // 0.35% - мини джекпот (x6)
  if (price >= 500) return 6;           // 0.6% - отличный выигрыш (x4)

  // ХОРОШИЕ ВЫИГРЫШИ (8% общий)
  if (price >= 300) return 18;          // 1.8% - x2.5 выигрыш
  if (price >= 200) return 22;          // 2.2% - x1.6-2 выигрыш
  if (price >= 150) return 26;          // 2.6% - хороший выигрыш
  if (price >= 120) return 22;          // 2.2% - неплохой выигрыш

  // СРЕДНИЕ ВЫИГРЫШИ (25% общий)
  if (price >= 100) return 60;          // 6% - близко к окупу
  if (price >= 80) return 70;           // 7% - средний выигрыш
  if (price >= 60) return 80;           // 8% - небольшой убыток
  if (price >= 50) return 40;           // 4% - убыток

  // ЧАСТЫЕ ДРОПЫ (66.5% общий)
  if (price >= 40) return 140;          // 14% - средний убыток
  if (price >= 30) return 160;          // 16% - заметный убыток
  if (price >= 25) return 150;          // 15% - большой убыток
  if (price >= 20) return 130;          // 13% - очень дешевые
  if (price >= 15) return 85;           // 8.5% - мусор
  return 60;                            // 6% - базовый мусор
}

/**
 * ЕЖЕДНЕВНЫЙ КЕЙС - СТАТУС++ (7500₽/30 дней = 250₽/день)
 * Целевой RTP: 70% (средний выигрыш ~175₽) + защита от дубликатов
 */
function calculateWeightForStatusTier3(price) {
  price = parseFloat(price) || 0;

  // СУПЕР ДЖЕКПОТЫ (1% общий) - самый высокий шанс на дорогие предметы
  if (price >= 50000) return 0.01;      // 0.001% - ультра мега джекпот (x200)
  if (price >= 30000) return 0.02;      // 0.002% - супер мега джекпот (x120)
  if (price >= 20000) return 0.05;      // 0.005% - мега джекпот++ (x80)
  if (price >= 15000) return 0.1;       // 0.01% - мега джекпот+ (x60)
  if (price >= 10000) return 0.2;       // 0.02% - мега джекпот (x40)
  if (price >= 5000) return 0.8;        // 0.08% - большой джекпот (x20)
  if (price >= 3000) return 1.5;        // 0.15% - крупный джекпот (x12)
  if (price >= 2000) return 3;          // 0.3% - джекпот (x8)
  if (price >= 1000) return 6;          // 0.6% - мини джекпот (x4)
  if (price >= 800) return 8;           // 0.8% - отличный выигрыш (x3.2)
  if (price >= 500) return 10;          // 1% - хороший выигрыш (x2)

  // ХОРОШИЕ ВЫИГРЫШИ (12% общий)
  if (price >= 400) return 22;          // 2.2% - x1.6 выигрыш
  if (price >= 300) return 32;          // 3.2% - хороший выигрыш
  if (price >= 250) return 36;          // 3.6% - окуп дня
  if (price >= 200) return 36;          // 3.6% - близко к окупу

  // СРЕДНИЕ ВЫИГРЫШИ (30% общий)
  if (price >= 150) return 80;          // 8% - небольшой убыток
  if (price >= 120) return 90;          // 9% - средний выигрыш
  if (price >= 100) return 70;          // 7% - неплохо
  if (price >= 80) return 60;           // 6% - убыток

  // ЧАСТЫЕ ДРОПЫ (57% общий)
  if (price >= 60) return 120;          // 12% - средний убыток
  if (price >= 50) return 130;          // 13% - заметный убыток
  if (price >= 40) return 110;          // 11% - большой убыток
  if (price >= 30) return 100;          // 10% - очень дешевые
  if (price >= 20) return 110;          // 11% - мусор
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

    case 'platinum_250':
      return calculateWeightForPlatinum250(price);

    // КЕЙСЫ ОТ 601₽ - РАВНОМЕРНОЕ РАСПРЕДЕЛЕНИЕ
    case 'diamond_601':
      return calculateWeightForDiamond601(price);

    case 'legendary_998':
      return calculateWeightForLegendary998(price);

    case 'mystic_2499':
      return calculateWeightForMystic2499(price);

    case 'epic_5000':
      return calculateWeightForEpic5000(price);

    case 'mythic_10000':
      return calculateWeightForMythic10000(price);

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
function selectItemWithModifiedWeights(itemsWithWeights, userSubscriptionTier = 0, excludedItemIds = [], caseType = 'premium') {
  console.log(`[selectItemWithModifiedWeights] Получено предметов: ${itemsWithWeights ? itemsWithWeights.length : 'null/undefined'}, caseType: ${caseType}`);

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
    const weight = item.modifiedWeight || calculateCorrectWeightByPrice(parseFloat(item.price) || 0, caseType);
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
    const itemWeight = item.modifiedWeight || calculateCorrectWeightByPrice(parseFloat(item.price) || 0, caseType);
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
  userSubscriptionTier = 0,
  caseType = 'premium'
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

  return selectItemWithModifiedWeights(itemsToSelect, userSubscriptionTier, [], caseType);
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
  userSubscriptionTier = 0,
  caseType = 'premium'
) {
  console.log(`[selectItemWithFullDuplicateProtection] Получено предметов: ${itemsWithWeights ? itemsWithWeights.length : 'null'}`);
  console.log(`[selectItemWithFullDuplicateProtection] Исключено предметов: ${excludedItems.length}`);
  console.log(`[selectItemWithFullDuplicateProtection] Уровень подписки: ${userSubscriptionTier}`);
  console.log(`[selectItemWithFullDuplicateProtection] Тип кейса: ${caseType}`);

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

    return selectItemWithModifiedWeights(availableItems, userSubscriptionTier, [], caseType);
  }

  // Для обычных пользователей используем стандартную логику (без исключений)
  return selectItemWithModifiedWeights(itemsWithWeights, userSubscriptionTier, [], caseType);
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
  if (templateId === '99999999-9999-9999-9999-999999999999' || price === 49) {
    return 'standard_99'; // Пушистый
  }
  if (templateId === 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' || price === 101) {
    return 'standard_99'; // Золотой
  }
  if (templateId === 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' || price === 250) {
    return 'platinum_250'; // Платиновый - щедрые веса (RTP 70%)
  }
  // КЕЙСЫ ОТ 601₽ - РАВНОМЕРНОЕ РАСПРЕДЕЛЕНИЕ
  if (templateId === 'cccccccc-cccc-cccc-cccc-cccccccccccc' || price === 601) {
    return 'diamond_601'; // Алмазный - равномерное распределение
  }
  if (templateId === 'dddddddd-dddd-dddd-dddd-dddddddddddd' || price === 998) {
    return 'legendary_998'; // Легендарный - равномерное распределение
  }
  if (templateId === 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' || price === 2499) {
    return 'mystic_2499'; // Мистический - равномерное распределение
  }
  if (templateId === 'ffffffff-ffff-ffff-ffff-ffffffffffff' || price === 5000) {
    return 'epic_5000'; // Эпический - равномерное распределение
  }
  if (templateId === '10101010-1010-1010-1010-101010101010' || price === 10000) {
    return 'mythic_10000'; // Мифический - равномерное распределение
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
    if (price === 250) return 'platinum_250';
    if (price === 499) return 'premium_499';
    // КЕЙСЫ ОТ 601₽ - РАВНОМЕРНОЕ РАСПРЕДЕЛЕНИЕ
    if (price === 601) return 'diamond_601';
    if (price === 998) return 'legendary_998';
    if (price === 2499) return 'mystic_2499';
    if (price === 5000) return 'epic_5000';
    if (price === 10000) return 'mythic_10000';
    if (price >= 601) return 'diamond_601'; // Для других дорогих кейсов тоже равномерное распределение
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

